package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// RegistrationUsecase: start a registration (issues a learner token), get it, save progress,
// save answers (version check) and submit (this file, Dev A); continue on another device,
// consent codes and Telegram (registration_resume.go, Dev B).
type RegistrationUsecase struct {
	LearnerRepo      domain.LearnerRepositoryI
	RegistrationRepo domain.RegistrationRepositoryI
	SupportRepo      domain.SupportRepositoryI // only to say whether support needs were sent
	PartnerRepo      domain.PartnerRepositoryI // referral partners (the "I have no ID" route)
	Sessions         domain.SessionIssuer      // learner token for a new sign-up (the auth use case)
	Flows            domain.FlowStore
	SessionRepo      domain.SessionRepositoryI // resume tokens, verification codes, outbox
	Security         domain.SecurityService
	Messages         domain.MessageService
	PublicURL        string // PUBLIC_WEB_URL, for resume links (set in main.go)
}

var _ domain.RegistrationUsecaseI = (*RegistrationUsecase)(nil)

func NewRegistrationUsecase(
	lrp domain.LearnerRepositoryI,
	rrp domain.RegistrationRepositoryI,
	supportRepo domain.SupportRepositoryI,
	prp domain.PartnerRepositoryI,
	sessions domain.SessionIssuer,
	flows domain.FlowStore,
	sessionRepo domain.SessionRepositoryI,
	sec domain.SecurityService,
	msg domain.MessageService,
) *RegistrationUsecase {
	return &RegistrationUsecase{
		LearnerRepo:      lrp,
		RegistrationRepo: rrp,
		SupportRepo:      supportRepo,
		PartnerRepo:      prp,
		Sessions:         sessions,
		Flows:            flows,
		SessionRepo:      sessionRepo,
		Security:         sec,
		Messages:         msg,
	}
}

// Flows a registration can use. Partner-specific sign-up flows (I5, Should) are added here.
var registrationFlows = map[string]bool{domain.FlowSignup: true}

var inputMethods = map[string]bool{"typed": true, "voice": true, "choice": true, "partner": true}

// A language code such as "am", "en" or "om-ET".
var languageCode = regexp.MustCompile(`^[a-z]{2,3}(-[a-z0-9]{2,8})?$`)

func cleanLanguage(lang string) (string, error) {
	lang = strings.ToLower(strings.TrimSpace(lang))
	if !languageCode.MatchString(lang) {
		return "", domain.NewValidationError("language", codeInvalid)
	}
	return lang, nil
}

// Start creates a draft learner and registration for the partner whose key was used, and
// gives the device a learner token so it can save answers (R16).
func (uc *RegistrationUsecase) Start(ctx context.Context, actor domain.Actor, flowID string, flowVersion int, language string, simple bool) (*domain.Registration, string, time.Time, error) {
	fail := func(err error) (*domain.Registration, string, time.Time, error) { return nil, "", time.Time{}, err }

	if actor.PartnerID == uuid.Nil {
		return fail(domain.ErrUnauthorized) // set by the partner key middleware
	}
	if !registrationFlows[flowID] {
		return fail(domain.NewValidationError("flow_id", codeInvalidChoice))
	}
	flow, ok := uc.Flows.Flow(flowID, flowVersion)
	if !ok {
		return fail(domain.NewValidationError("flow_version", codeInvalidChoice))
	}
	lang, err := cleanLanguage(language)
	if err != nil {
		return fail(err)
	}

	learner, reg, err := uc.RegistrationRepo.Start(ctx,
		&domain.Learner{PartnerID: actor.PartnerID, Language: lang, SimpleMode: simple},
		&domain.Registration{FlowID: flow.ID, FlowVersion: flow.Version, CurrentStep: flow.Start},
	)
	if err != nil {
		return fail(err)
	}
	token, expiresAt, err := uc.Sessions.IssueLearnerSession(ctx, learner.ID, actor.PartnerID)
	if err != nil {
		return fail(err)
	}
	return reg, token, expiresAt, nil
}

// Get returns the registration with every saved answer, so a learner can continue where
// they stopped (or on another device). Support needs are never returned, only whether they
// were sent.
func (uc *RegistrationUsecase) Get(ctx context.Context, actor domain.Actor, id uuid.UUID) (*domain.RegistrationView, error) {
	reg, err := loadOwnedRegistration(ctx, uc.RegistrationRepo, actor, id)
	if err != nil {
		return nil, err
	}
	learner, err := uc.LearnerRepo.GetByID(ctx, reg.LearnerID)
	if err != nil {
		return nil, err
	}
	answers, err := uc.RegistrationRepo.ListAnswersByRegistrationID(ctx, reg.ID)
	if err != nil {
		return nil, err
	}
	for _, a := range answers {
		hideSealedFile(a)
	}
	supportSent, err := uc.SupportRepo.Exists(ctx, reg.LearnerID)
	if err != nil {
		return nil, err
	}
	return &domain.RegistrationView{Registration: reg, Learner: learner, Answers: answers, SupportSubmitted: supportSent}, nil
}

// UpdateProgress saves where the learner is in the flow and their display preferences.
// Only the values that were sent change.
func (uc *RegistrationUsecase) UpdateProgress(ctx context.Context, actor domain.Actor, id uuid.UUID, currentStep, language *string, simple *bool) error {
	reg, err := loadOwnedRegistration(ctx, uc.RegistrationRepo, actor, id)
	if err != nil {
		return err
	}

	if currentStep != nil {
		flow, err := uc.flowOf(reg)
		if err != nil {
			return err
		}
		if _, ok := flow.Step(*currentStep); !ok {
			return domain.NewValidationError("current_step", "unknown_step")
		}
	}
	if language != nil {
		lang, err := cleanLanguage(*language)
		if err != nil {
			return err
		}
		language = &lang
	}

	if currentStep != nil {
		if err := uc.RegistrationRepo.UpdateProgress(ctx, reg.ID, *currentStep); err != nil {
			return err
		}
	}
	if language != nil || simple != nil {
		return uc.LearnerRepo.UpdatePreferences(ctx, reg.LearnerID, language, simple)
	}
	return nil
}

// SaveAnswer checks one answer against its step in the flow file, cleans it (for example
// the phone number becomes +2519…) and saves it with the version check: if another device
// saved a newer version since baseVersion, nothing is saved and *ConflictError comes back
// with the saved answer (R15).
func (uc *RegistrationUsecase) SaveAnswer(ctx context.Context, actor domain.Actor, regID uuid.UUID, questionID string, value json.RawMessage, inputMethod string, baseVersion int) (*domain.Answer, error) {
	reg, err := loadOwnedRegistration(ctx, uc.RegistrationRepo, actor, regID)
	if err != nil {
		return nil, err
	}
	if reg.Status != domain.RegistrationStatusDraft {
		return nil, domain.ErrAlreadySubmitted
	}
	flow, err := uc.flowOf(reg)
	if err != nil {
		return nil, err
	}
	step, ok := flow.Step(questionID)
	if !ok || step.Storage != domain.StorageAnswer {
		// Support needs have their own encrypted endpoint; consent screens stay on the device.
		return nil, domain.NewValidationError("question_id", "unknown_question")
	}
	if !inputMethods[inputMethod] {
		return nil, domain.NewValidationError("input_method", codeInvalidChoice)
	}
	if baseVersion < 0 {
		return nil, domain.NewValidationError("base_version", codeInvalid)
	}

	isOption, err := uc.optionChecker(ctx, step)
	if err != nil {
		return nil, err
	}
	clean, err := validateAnswer(step, value, isOption)
	if err != nil {
		return nil, err
	}
	if step.Type == domain.StepFile {
		if clean, err = uc.sealFile(reg.LearnerID, step.ID, clean); err != nil {
			return nil, err
		}
	}
	saved, err := uc.RegistrationRepo.SaveAnswerIfVersion(ctx, &domain.Answer{
		RegistrationID: reg.ID,
		QuestionID:     step.ID,
		Value:          clean,
		InputMethod:    inputMethod,
	}, baseVersion)
	var conflict *domain.ConflictError
	if errors.As(err, &conflict) && conflict.Current != nil {
		hideSealedFile(conflict.Current)
	}
	if saved != nil {
		hideSealedFile(saved)
	}
	return saved, err
}

// sealedFile is how a photo answer is stored: the name in plain text, the photo (a data URL)
// as AES-256-GCM ciphertext.
type sealedFile struct {
	Name       string `json:"name"`
	Nonce      []byte `json:"nonce,omitempty"`
	Ciphertext []byte `json:"ciphertext,omitempty"`
}

// sealFile encrypts the photo of a checked file answer. The learner and the step are the
// additional data, so a copied value won't open for another learner or another question.
// A cleared answer has no photo and is stored as it is.
func (uc *RegistrationUsecase) sealFile(learnerID uuid.UUID, stepID string, clean json.RawMessage) (json.RawMessage, error) {
	var f fileAnswer
	if json.Unmarshal(clean, &f) != nil || f.Data == "" {
		return clean, nil
	}
	nonce, ciphertext, err := uc.Security.Encrypt([]byte(f.Data), learnerID.String()+":"+stepID)
	if err != nil {
		return nil, err
	}
	return json.Marshal(sealedFile{Name: f.Name, Nonce: nonce, Ciphertext: ciphertext})
}

// hideSealedFile cuts the ciphertext out of an answer before it leaves the use case: the
// device only needs the name. Any other answer is left alone.
func hideSealedFile(a *domain.Answer) {
	var f sealedFile
	if json.Unmarshal(a.Value, &f) == nil && len(f.Ciphertext) > 0 {
		a.Value, _ = json.Marshal(sealedFile{Name: f.Name})
	}
}

// Submit finishes the sign-up (R5, R7, R17):
//  1. walk the flow with the saved answers, and list every required answer that is missing
//  2. copy name, contact, phone and date of birth into the learner record
//  3. record how the learner can prove who they are (identity evidence, self-declared)
//  4. if they have no ID, refer them to the partner organisation they chose
//
// Steps 2–4 and "status = submitted" happen in one database transaction.
// Submitting again returns the same result instead of an error (a retry on a bad network).
func (uc *RegistrationUsecase) Submit(ctx context.Context, actor domain.Actor, regID uuid.UUID) (*domain.SubmitResult, error) {
	reg, err := loadOwnedRegistration(ctx, uc.RegistrationRepo, actor, regID)
	if err != nil {
		return nil, err
	}
	if reg.Status == domain.RegistrationStatusSubmitted {
		return uc.submittedResult(ctx, reg)
	}
	flow, err := uc.flowOf(reg)
	if err != nil {
		return nil, err
	}
	saved, err := uc.RegistrationRepo.ListAnswersByRegistrationID(ctx, reg.ID)
	if err != nil {
		return nil, err
	}
	all := make(map[string]json.RawMessage, len(saved))
	for _, a := range saved {
		all[a.QuestionID] = a.Value
	}

	// Only answers on the learner's path count; required ones must be there.
	answers := make(map[string]json.RawMessage, len(saved))
	var missing []domain.FieldError
	for _, step := range flow.Path(all) {
		if step.Storage != domain.StorageAnswer {
			continue
		}
		v, ok := all[step.ID]
		if empty, _ := emptyValue(v); !ok || empty {
			if step.Required {
				missing = append(missing, domain.FieldError{Field: step.ID, Code: codeRequired})
			}
			continue
		}
		answers[step.ID] = v
	}
	if len(missing) > 0 {
		return nil, &domain.ValidationError{Fields: missing}
	}

	profile, evidence, referral, err := buildSignupRecords(reg.LearnerID, answers)
	if err != nil {
		return nil, err
	}
	result, err := uc.RegistrationRepo.SubmitTx(ctx, reg.ID, profile, evidence, referral)
	if errors.Is(err, domain.ErrAlreadySubmitted) {
		return uc.submittedResult(ctx, reg) // another submit finished first
	}
	if err != nil {
		return nil, err
	}
	if result.Referral != nil {
		if result.ReferralPartnerName, err = uc.referralPartnerName(ctx, result.Referral.PartnerID); err != nil {
			return nil, err
		}
	}
	return result, nil
}

// buildSignupRecords turns the sign-up answers (step IDs of shared/flows/signup.json) into
// the learner profile, the identity evidence and, for the "I have no ID" route, a referral.
func buildSignupRecords(learnerID uuid.UUID, answers map[string]json.RawMessage) (*domain.Learner, *domain.IdentityEvidence, *domain.Referral, error) {
	profile := &domain.Learner{
		ID:            learnerID,
		FullName:      answerString(answers["full_name"]),
		PreferredName: answerString(answers["preferred_name"]),
		ContactMethod: answerString(answers["contact_method"]),
		PhoneE164:     answerString(answers["phone"]), // only on the path for phone or Telegram contact
	}
	profile.DOB, profile.DOBCalendar = answerDate(answers["dob"])

	route := answerString(answers["id_route"])
	if route == "" {
		return nil, nil, nil, domain.NewValidationError("id_route", codeRequired)
	}
	evidence := &domain.IdentityEvidence{
		LearnerID: learnerID,
		Route:     route,
		DocType:   answerString(answers["id_doc_type"]), // only on the path for "other document"
		Last4:     answerString(answers["id_last4"]),
		Level:     domain.IdentitySelfDeclared, // partner staff can raise it later (E1)
	}

	var referral *domain.Referral
	if route == domain.IDRouteNone {
		partnerID, err := uuid.Parse(answerString(answers["referral_partner"]))
		if err != nil {
			return nil, nil, nil, domain.NewValidationError("referral_partner", codeInvalidChoice)
		}
		referral = &domain.Referral{
			LearnerID:         learnerID,
			PartnerID:         partnerID,
			ContactPreference: answerString(answers["referral_contact"]),
			Status:            domain.ReferralStatusRequested,
		}
	}
	return profile, evidence, referral, nil
}

// submittedResult rebuilds the submit answer for a registration that is already submitted.
func (uc *RegistrationUsecase) submittedResult(ctx context.Context, reg *domain.Registration) (*domain.SubmitResult, error) {
	learner, err := uc.LearnerRepo.GetByID(ctx, reg.LearnerID)
	if err != nil {
		return nil, err
	}
	result := &domain.SubmitResult{Learner: learner}
	referral, err := uc.LearnerRepo.GetLatestReferral(ctx, learner.ID)
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return result, nil
	case err != nil:
		return nil, err
	}
	result.Referral = referral
	if result.ReferralPartnerName, err = uc.referralPartnerName(ctx, referral.PartnerID); err != nil {
		return nil, err
	}
	return result, nil
}

func (uc *RegistrationUsecase) referralPartnerName(ctx context.Context, id uuid.UUID) (string, error) {
	partners, err := uc.PartnerRepo.ListReferralPartners(ctx)
	if err != nil {
		return "", err
	}
	for _, p := range partners {
		if p.ID == id {
			return p.Name, nil
		}
	}
	return "", nil
}

// optionChecker says which values a choice step accepts: its own options, the needs
// vocabulary, or the IDs of the referral partners from GET /config.
func (uc *RegistrationUsecase) optionChecker(ctx context.Context, step *domain.FlowStep) (func(string) bool, error) {
	if step.Type != domain.StepSingleChoice && step.Type != domain.StepMultiChoice {
		return nil, nil
	}
	switch step.OptionsFrom {
	case domain.OptionsFromNeeds:
		return uc.Flows.IsNeedCode, nil
	case domain.OptionsFromReferralPartners:
		partners, err := uc.PartnerRepo.ListReferralPartners(ctx)
		if err != nil {
			return nil, err
		}
		ids := make(map[uuid.UUID]bool, len(partners))
		for _, p := range partners {
			ids[p.ID] = true
		}
		return func(v string) bool {
			id, err := uuid.Parse(v)
			return err == nil && ids[id]
		}, nil
	default:
		return isOneOf(step.Options), nil
	}
}

func (uc *RegistrationUsecase) flowOf(reg *domain.Registration) (*domain.Flow, error) {
	flow, ok := uc.Flows.Flow(reg.FlowID, reg.FlowVersion)
	if !ok {
		return nil, fmt.Errorf("flow %q version %d is not loaded (check FLOWS_DIR)", reg.FlowID, reg.FlowVersion)
	}
	return flow, nil
}

// ---- shared by the registration and support use cases ----

// loadOwnedRegistration loads a registration the actor may use (Q7): no token is 401,
// someone else's registration is 403.
func loadOwnedRegistration(ctx context.Context, repo domain.RegistrationRepositoryI, actor domain.Actor, id uuid.UUID) (*domain.Registration, error) {
	if actor.IsAnonymous() {
		return nil, domain.ErrUnauthorized
	}
	reg, err := repo.GetRegistrationByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if !actor.ActsFor(reg.LearnerID) {
		return nil, domain.ErrForbidden
	}
	return reg, nil
}

func isOneOf(values []string) func(string) bool {
	set := make(map[string]bool, len(values))
	for _, v := range values {
		set[v] = true
	}
	return func(v string) bool { return set[v] }
}
