package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// maxPreferredNameRunes: the longest preferred name accepted once the sign-up flow no longer
// asks for one (PATCH /me from older clients).
const maxPreferredNameRunes = 100

// MeUsecase: the signed-in learner sees, changes and deletes their own data (Q4):
// GET, PATCH, DELETE and GET /me/export.
type MeUsecase struct {
	LearnerRepo      domain.LearnerRepositoryI // the learner, their preferences and latest referral
	ProfileRepo      domain.ProfileRepositoryI
	PartnerRepo      domain.PartnerRepositoryI // the referral partner's name
	RegistrationRepo domain.RegistrationRepositoryI
	ConsentRepo      domain.ConsentRepositoryI
	Flows            domain.FlowStore       // PATCH uses the rules of the sign-up steps
	Security         domain.SecurityService // opens the learner's own support request
}

var _ domain.MeUsecaseI = (*MeUsecase)(nil)

func NewMeUsecase(
	lrp domain.LearnerRepositoryI,
	profile domain.ProfileRepositoryI,
	prp domain.PartnerRepositoryI,
	reg domain.RegistrationRepositoryI,
	consent domain.ConsentRepositoryI,
	flows domain.FlowStore,
	sec domain.SecurityService,
) *MeUsecase {
	return &MeUsecase{
		LearnerRepo:      lrp,
		ProfileRepo:      profile,
		PartnerRepo:      prp,
		RegistrationRepo: reg,
		ConsentRepo:      consent,
		Flows:            flows,
		Security:         sec,
	}
}

// meLearnerID: /me is only for a learner's own token.
func meLearnerID(actor domain.Actor) (uuid.UUID, error) {
	if actor.IsAnonymous() {
		return uuid.Nil, domain.ErrUnauthorized
	}
	if actor.Kind != domain.ActorLearner || actor.ID == uuid.Nil {
		return uuid.Nil, domain.ErrForbidden
	}
	return actor.ID, nil
}

// Get returns everything about the learner: profile, latest registration, identity evidence,
// referral and their support request, decrypted (it is their own data).
func (uc *MeUsecase) Get(ctx context.Context, actor domain.Actor) (*domain.LearnerProfile, error) {
	id, err := meLearnerID(actor)
	if err != nil {
		return nil, err
	}
	learner, err := uc.LearnerRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return uc.profile(ctx, learner)
}

// Export returns all personal data and history stored for the learner (Q4).
func (uc *MeUsecase) Export(ctx context.Context, actor domain.Actor) (*domain.LearnerExport, error) {
	id, err := meLearnerID(actor)
	if err != nil {
		return nil, err
	}
	profile, err := uc.Get(ctx, actor)
	if err != nil {
		return nil, err
	}

	var answers []*domain.Answer
	if profile.Registration != nil && uc.RegistrationRepo != nil {
		ans, err := uc.RegistrationRepo.ListAnswersByRegistrationID(ctx, profile.Registration.ID)
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, err
		}
		answers = ans
	}

	var consents []*domain.Consent
	if uc.ConsentRepo != nil {
		con, err := uc.ConsentRepo.ListConsentsByLearnerID(ctx, id)
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, err
		}
		consents = con
	}

	return &domain.LearnerExport{
		ExportedAt: time.Now().UTC(),
		Profile:    profile,
		Answers:    answers,
		Consents:   consents,
	}, nil
}

// Update changes only what was sent, with the same rules as the sign-up steps of the same
// name. Before submit, only language and simple mode can change (ErrNotRegistered otherwise).
// Contact by partner or none clears the stored phone number (data minimisation).
func (uc *MeUsecase) Update(ctx context.Context, actor domain.Actor, ch *domain.ProfileChanges) (*domain.LearnerProfile, error) {
	id, err := meLearnerID(actor)
	if err != nil {
		return nil, err
	}
	if ch == nil {
		ch = &domain.ProfileChanges{}
	}
	learner, err := uc.LearnerRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	var language *string
	if ch.Language != nil {
		lang, err := cleanLanguage(*ch.Language)
		if err != nil {
			return nil, err
		}
		language = &lang
	}

	profileSent := ch.FullName != nil || ch.PreferredName != nil || ch.ContactMethod != nil || ch.Phone != nil || ch.DOB != nil
	if learner.Status != domain.LearnerStatusRegistered {
		if profileSent {
			return nil, domain.ErrNotRegistered // the sign-up answers are changed on the registration
		}
		if language != nil || ch.SimpleMode != nil {
			if err := uc.LearnerRepo.UpdatePreferences(ctx, learner.ID, language, ch.SimpleMode); err != nil {
				return nil, err
			}
			if learner, err = uc.LearnerRepo.GetByID(ctx, id); err != nil {
				return nil, err
			}
		}
		return uc.profile(ctx, learner)
	}
	if !profileSent && language == nil && ch.SimpleMode == nil {
		return uc.profile(ctx, learner) // nothing to change
	}

	flow, err := uc.signupFlow(ctx, learner.ID)
	if err != nil {
		return nil, err
	}
	next := *learner
	verr := &domain.ValidationError{}
	// check validates one field with its sign-up step; problems are collected in verr.
	check := func(field string, raw json.RawMessage) (json.RawMessage, bool, error) {
		clean, err := validateProfileField(flow, field, raw)
		var fe *domain.ValidationError
		if errors.As(err, &fe) {
			verr.Fields = append(verr.Fields, fe.Fields...)
			return nil, false, nil
		}
		return clean, err == nil, err
	}
	str := func(s string) json.RawMessage { b, _ := json.Marshal(s); return b }

	if ch.FullName != nil {
		clean, ok, err := check("full_name", str(*ch.FullName))
		if err != nil {
			return nil, err
		}
		if ok {
			next.FullName = answerString(clean)
		}
	}
	if ch.PreferredName != nil {
		if _, asked := flow.Step("preferred_name"); asked {
			clean, ok, err := check("preferred_name", str(*ch.PreferredName))
			if err != nil {
				return nil, err
			}
			if ok {
				next.PreferredName = answerString(clean)
			}
		} else {
			// The sign-up flow no longer asks for it (names in Ethiopia are the person's name,
			// father's and grandfather's: one full name). Still accepted from older clients.
			name := strings.TrimSpace(*ch.PreferredName)
			if utf8.RuneCountInString(name) > maxPreferredNameRunes {
				verr.Fields = append(verr.Fields, domain.FieldError{Field: "preferred_name", Code: codeTooLong})
			} else {
				next.PreferredName = name
			}
		}
	}
	if ch.ContactMethod != nil {
		clean, ok, err := check("contact_method", str(*ch.ContactMethod))
		if err != nil {
			return nil, err
		}
		if ok {
			next.ContactMethod = answerString(clean)
		}
	}
	switch next.ContactMethod {
	case domain.ContactPartner, domain.ContactNone:
		next.PhoneE164 = "" // no phone step on this path: don't keep the number
	case domain.ContactPhone, domain.ContactTelegram:
		if ch.Phone != nil {
			clean, ok, err := check("phone", str(*ch.Phone))
			if err != nil {
				return nil, err
			}
			if ok {
				next.PhoneE164 = answerString(clean)
			}
		} else if next.PhoneE164 == "" {
			verr.Fields = append(verr.Fields, domain.FieldError{Field: "phone", Code: codeRequired})
		}
	}
	if ch.DOB != nil {
		clean, ok, err := check("dob", ch.DOB)
		if err != nil {
			return nil, err
		}
		if ok {
			next.DOB, next.DOBCalendar = answerDate(clean) // null clears it
		}
	}
	if language != nil {
		next.Language = *language
	}
	if ch.SimpleMode != nil {
		next.SimpleMode = *ch.SimpleMode
	}
	if len(verr.Fields) > 0 {
		return nil, verr
	}

	updated, err := uc.ProfileRepo.UpdateProfile(ctx, &next)
	if err != nil {
		return nil, err
	}
	return uc.profile(ctx, updated)
}

// Delete removes the learner and everything about them (registrations, answers, identity
// evidence, referrals, support request, consents, applications), ends all their sessions and
// writes an audit row without personal data, in one transaction.
func (uc *MeUsecase) Delete(ctx context.Context, actor domain.Actor) error {
	id, err := meLearnerID(actor)
	if err != nil {
		return err
	}
	return uc.ProfileRepo.DeleteLearner(ctx, id, &domain.AuditEntry{
		ActorType:  domain.AuditActorLearner,
		ActorID:    &id,
		Action:     domain.AuditActionLearnerDeleted,
		TargetType: domain.AuditTargetLearner,
		TargetID:   &id,
	})
}

// profile gathers what GET /me shows. Missing parts (no evidence before submit, no support
// request, no referral) stay nil.
func (uc *MeUsecase) profile(ctx context.Context, learner *domain.Learner) (*domain.LearnerProfile, error) {
	p := &domain.LearnerProfile{Learner: learner}

	reg, err := uc.ProfileRepo.GetLatestRegistration(ctx, learner.ID)
	if err := ignoreNotFound(err); err != nil {
		return nil, err
	}
	p.Registration = reg

	evidence, err := uc.ProfileRepo.GetLatestIdentityEvidence(ctx, learner.ID)
	if err := ignoreNotFound(err); err != nil {
		return nil, err
	}
	p.Identity = evidence

	referral, err := uc.LearnerRepo.GetLatestReferral(ctx, learner.ID)
	if err := ignoreNotFound(err); err != nil {
		return nil, err
	}
	if referral != nil {
		p.Referral = referral
		partner, err := uc.PartnerRepo.GetByID(ctx, referral.PartnerID)
		if err := ignoreNotFound(err); err != nil {
			return nil, err
		}
		if partner != nil {
			p.ReferralPartnerName = partner.Name
		}
	}

	sealed, err := uc.ProfileRepo.GetSealedSupportRequest(ctx, learner.ID)
	if err := ignoreNotFound(err); err != nil {
		return nil, err
	}
	if sealed != nil {
		if p.Support, err = openSupportRequest(uc.Security, sealed); err != nil {
			return nil, err
		}
	}
	return p, nil
}

// signupFlow is the sign-up flow the learner used (the latest version if unknown): PATCH /me
// checks each field with the rules of its step.
func (uc *MeUsecase) signupFlow(ctx context.Context, learnerID uuid.UUID) (*domain.Flow, error) {
	version := 0
	reg, err := uc.ProfileRepo.GetLatestRegistration(ctx, learnerID)
	if err := ignoreNotFound(err); err != nil {
		return nil, err
	}
	if reg != nil && reg.FlowID == domain.FlowSignup {
		version = reg.FlowVersion
	}
	if f, ok := uc.Flows.Flow(domain.FlowSignup, version); ok {
		return f, nil
	}
	if f, ok := uc.Flows.Flow(domain.FlowSignup, 0); ok {
		return f, nil
	}
	return nil, fmt.Errorf("flow %q is not loaded (check FLOWS_DIR)", domain.FlowSignup)
}

// validateProfileField checks a PATCH /me value with the sign-up step of the same name
// (validateAnswer) and reports problems on that field instead of on "value".
func validateProfileField(flow *domain.Flow, stepID string, raw json.RawMessage) (json.RawMessage, error) {
	step, ok := flow.Step(stepID)
	if !ok {
		return nil, fmt.Errorf("flow %q has no step %q", flow.ID, stepID)
	}
	var isOption func(string) bool
	if (step.Type == domain.StepSingleChoice || step.Type == domain.StepMultiChoice) && step.OptionsFrom == "" {
		isOption = isOneOf(step.Options)
	}
	clean, err := validateAnswer(step, raw, isOption)
	var verr *domain.ValidationError
	if errors.As(err, &verr) {
		fields := make([]domain.FieldError, 0, len(verr.Fields))
		for _, f := range verr.Fields {
			if f.Field == valueField {
				f.Field = stepID
			}
			fields = append(fields, f)
		}
		return nil, &domain.ValidationError{Fields: fields}
	}
	return clean, err
}

// ignoreNotFound treats "no row" as "nothing to show".
func ignoreNotFound(err error) error {
	if errors.Is(err, domain.ErrNotFound) {
		return nil
	}
	return err
}
