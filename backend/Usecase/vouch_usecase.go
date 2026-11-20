package usecase

import (
	"context"
	"crypto/hmac"
	"errors"
	"strings"
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// Trusted referral (E1): a referral organisation such as AAAPD vouches for a learner who has
// no ID. Its staff member meets or calls the person, confirms it, and gets a one-time code to
// tell them. The learner types the code on their profile (that is their agreement), and is then
// "confirmed by a partner": learners.identity_level and the latest identity evidence become
// partner_attested (with who and when), the referral becomes "attested", and both steps are in
// the audit log. No SMS is needed; with SMS on, the learner is also told by SMS.

const (
	vouchCodeLife     = 30 * time.Minute
	vouchMaxAttempts  = 5
	codeVouchWrong    = "code_wrong"
	codeVouchExpired  = "code_expired"
	codeVouchRequired = "required"
)

// MakeVouchCode: partner staff of the referral's organisation only; another organisation's
// referral is 404. confirmed must be true (the staff member's statement in the staff app).
func (uc *ReferralUsecase) MakeVouchCode(ctx context.Context, actor domain.Actor, referralID uuid.UUID, confirmed bool) (*domain.VouchCodeIssued, error) {
	partnerID, err := partnerStaffOf(actor)
	if err != nil {
		return nil, err
	}
	if uc.Vouch == nil || uc.Security == nil {
		return nil, errors.New("vouching is not set up (VouchRepo, Security)")
	}
	if !confirmed {
		return nil, domain.NewValidationError("confirmed", codeVouchRequired)
	}
	ref, err := uc.ReferralRepo.Get(ctx, referralID, partnerID)
	if err != nil {
		return nil, err
	}
	if ref.Referral.Status == domain.ReferralStatusAttested {
		return nil, domain.ErrAlreadyExists // already confirmed
	}

	code, hash, err := uc.Security.NewVerificationCode()
	if err != nil {
		return nil, err
	}
	staffID, learnerID := actor.ID, ref.Referral.LearnerID
	vc := &domain.VouchCode{
		ReferralID: ref.Referral.ID, LearnerID: learnerID, PartnerID: partnerID, StaffID: staffID,
		CodeHash: hash, ExpiresAt: time.Now().UTC().Add(vouchCodeLife),
	}
	if err := uc.Vouch.Create(ctx, vc, &domain.AuditEntry{
		ActorType: domain.AuditActorStaff, ActorID: &staffID, Action: domain.AuditActionVouchCodeMade,
		TargetType: domain.AuditTargetLearner, TargetID: &learnerID,
		Meta: map[string]any{"referral_id": ref.Referral.ID.String()},
	}); err != nil {
		return nil, err
	}
	if ref.Referral.Status == domain.ReferralStatusRequested {
		_, _ = uc.ReferralRepo.UpdateStatus(ctx, ref.Referral.ID, partnerID, domain.ReferralStatusInProgress)
	}
	name := ""
	if ref.Learner != nil {
		name = ref.Learner.FullName
	}
	return &domain.VouchCodeIssued{Code: code, ExpiresAt: vc.ExpiresAt, LearnerName: name}, nil
}

// ConfirmVouch: the signed-in learner enters the code. Wrong or unknown codes say "code_wrong"
// (nothing tells whether a code exists); 5 wrong tries end the code (429).
func (uc *ReferralUsecase) ConfirmVouch(ctx context.Context, actor domain.Actor, code string) (*domain.Vouched, error) {
	learnerID, err := meLearnerID(actor)
	if err != nil {
		return nil, err
	}
	if uc.Vouch == nil || uc.Security == nil {
		return nil, errors.New("vouching is not set up (VouchRepo, Security)")
	}
	var b strings.Builder
	for _, r := range code {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	code = b.String()
	if code == "" {
		return nil, domain.NewValidationError("code", codeVouchRequired)
	}
	if len(code) != 6 {
		return nil, domain.NewValidationError("code", codeVouchWrong)
	}

	vc, err := uc.Vouch.Active(ctx, learnerID)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, domain.NewValidationError("code", codeVouchWrong)
	}
	if err != nil {
		return nil, err
	}
	if vc.FailedAttempts >= vouchMaxAttempts {
		return nil, domain.ErrTooManyAttempts
	}
	if time.Now().After(vc.ExpiresAt) {
		return nil, domain.NewValidationError("code", codeVouchExpired)
	}
	if !hmac.Equal(uc.Security.HashCode(code), vc.CodeHash) {
		n, err := uc.Vouch.AddFailure(ctx, vc.ID)
		if err != nil {
			return nil, err
		}
		if n >= vouchMaxAttempts {
			return nil, domain.ErrTooManyAttempts
		}
		return nil, domain.NewValidationError("code", codeVouchWrong)
	}

	if err := uc.Vouch.Attest(ctx, vc, &domain.AuditEntry{
		ActorType: domain.AuditActorLearner, ActorID: &learnerID, Action: domain.AuditActionVouched,
		TargetType: domain.AuditTargetLearner, TargetID: &learnerID,
		Meta: map[string]any{"referral_id": vc.ReferralID.String(), "staff_id": vc.StaffID.String()},
	}); err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, domain.NewValidationError("code", codeVouchWrong)
		}
		return nil, err
	}

	out := &domain.Vouched{IdentityLevel: domain.IdentityPartnerAttested}
	if uc.Partners != nil {
		if p, err := uc.Partners.GetByID(ctx, vc.PartnerID); err == nil && p != nil {
			out.PartnerName = p.Name
		}
	}
	// "AAAPD confirmed who you are" by SMS, only when real SMS is on and they chose phone contact.
	if uc.SMSNotices && uc.Learners != nil {
		if l, err := uc.Learners.GetByID(ctx, learnerID); err == nil {
			if phone, ok := smsPhone(l.ContactMethod, l.PhoneE164); ok {
				var outbox outboxWriter
				if uc.Outbox != nil {
					outbox = uc.Outbox
				}
				queueSMS(ctx, outbox, uc.Messages, phone, vouchedSMS(l.Language, out.PartnerName))
			}
		}
	}
	return out, nil
}
