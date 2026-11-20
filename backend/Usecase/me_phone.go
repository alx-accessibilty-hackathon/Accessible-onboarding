package usecase

import (
	"context"
	"crypto/hmac"
	"errors"
	"strings"
	"time"

	domain "bridge/Domain"
)

// The optional phone check on the profile page: the learner asks for a 6-digit code by SMS to
// their stored number and types it; then phone_verified is true. Not part of the sign-up (it
// must never block anyone). It needs real SMS (SMS_PROVIDER=smsethiopia); SMS Ethiopia sends
// only to Ethio Telecom numbers (+2519…), and its free test campaign only to numbers verified
// in its dashboard. Codes are stored as keyed hashes (verification_codes, purpose
// verify_phone), work for 10 minutes and allow 5 wrong tries; a new code at most every minute.

const (
	phoneCodePurpose  = "verify_phone"
	phoneCodeLife     = 10 * time.Minute
	phoneCodeResend   = time.Minute
	phoneCodeAttempts = 5
)

// PhoneCheck: what the phone check needs (set in main.go; nil Codes = not available).
type PhoneCheck struct {
	Codes            domain.SessionRepositoryI // verification codes + the SMS outbox
	Messages         domain.MessageService
	Available        bool // real SMS is on
	EthioTelecomOnly bool // the provider sends only to +2519… numbers
}

func (uc *MeUsecase) SendPhoneCode(ctx context.Context, actor domain.Actor) (*domain.PhoneCodeSent, error) {
	id, err := meLearnerID(actor)
	if err != nil {
		return nil, err
	}
	pc := uc.Phone
	if pc == nil || pc.Codes == nil || !pc.Available || uc.Security == nil {
		return nil, domain.ErrSMSUnavailable
	}
	learner, err := uc.LearnerRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if learner.Status != domain.LearnerStatusRegistered {
		return nil, domain.ErrNotRegistered
	}
	phone := learner.PhoneE164
	if phone == "" {
		return nil, domain.NewValidationError("phone", codeRequired)
	}
	if learner.PhoneVerified {
		return nil, domain.ErrAlreadyExists // already confirmed
	}
	if pc.EthioTelecomOnly && !strings.HasPrefix(phone, "+2519") {
		return nil, domain.NewValidationError("phone", "sms_not_supported")
	}
	// At most one new code a minute (the message service also allows 5 SMS an hour per number).
	if last, err := pc.Codes.GetActiveVerificationCode(ctx, phone, phoneCodePurpose); err == nil && last != nil &&
		time.Since(last.CreatedAt) < phoneCodeResend {
		return nil, domain.ErrRateLimited
	}

	code, hash, err := uc.Security.NewVerificationCode()
	if err != nil {
		return nil, err
	}
	expires := time.Now().UTC().Add(phoneCodeLife)
	if _, err := pc.Codes.CreateVerificationCode(ctx, phone, phoneCodePurpose, hash, &id, expires); err != nil {
		return nil, err
	}
	queueSMSKept(ctx, pc.Codes, pc.Messages, phone, phoneCodeSMS(learner.Language, code), phoneCodeSMS(learner.Language, "••••••"))
	return &domain.PhoneCodeSent{SentTo: maskPhone(phone), ExpiresAt: expires}, nil
}

func (uc *MeUsecase) ConfirmPhone(ctx context.Context, actor domain.Actor, code string) (*domain.LearnerProfile, error) {
	id, err := meLearnerID(actor)
	if err != nil {
		return nil, err
	}
	pc := uc.Phone
	if pc == nil || pc.Codes == nil || uc.Security == nil {
		return nil, domain.ErrSMSUnavailable
	}
	learner, err := uc.LearnerRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if learner.PhoneVerified {
		return uc.profile(ctx, learner) // already confirmed: nothing to do
	}
	phone := learner.PhoneE164
	if phone == "" {
		return nil, domain.NewValidationError("phone", codeRequired)
	}
	var b strings.Builder
	for _, r := range code {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	code = b.String()
	if code == "" {
		return nil, domain.NewValidationError("code", codeRequired)
	}
	if len(code) != 6 {
		return nil, domain.NewValidationError("code", codeVouchWrong)
	}

	// The newest unused, unexpired code for this number, and it must be this learner's.
	active, err := pc.Codes.GetActiveVerificationCode(ctx, phone, phoneCodePurpose)
	if errors.Is(err, domain.ErrNotFound) || (err == nil && (active == nil || active.LearnerID == nil || *active.LearnerID != id)) {
		return nil, domain.NewValidationError("code", codeVouchWrong) // wrong, expired or none
	}
	if err != nil {
		return nil, err
	}
	if active.FailedAttempts >= phoneCodeAttempts {
		return nil, domain.ErrTooManyAttempts
	}
	if !hmac.Equal(uc.Security.HashCode(code), active.CodeHash) {
		rec, err := pc.Codes.IncrementVerificationCodeFailedAttempts(ctx, active.ID)
		if err != nil {
			return nil, err
		}
		if rec != nil && rec.FailedAttempts >= phoneCodeAttempts {
			return nil, domain.ErrTooManyAttempts
		}
		return nil, domain.NewValidationError("code", codeVouchWrong)
	}

	if err := pc.Codes.MarkVerificationCodeUsed(ctx, active.ID); err != nil {
		return nil, err
	}
	if err := uc.ProfileRepo.SetPhoneVerified(ctx, id, phone); err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, domain.NewValidationError("code", codeVouchWrong) // the number changed meanwhile
		}
		return nil, err
	}
	return uc.Get(ctx, actor)
}

// phoneCodeSMS: the code SMS. The Amharic text needs a native speaker's review.
func phoneCodeSMS(lang, code string) string {
	if amharic(lang) {
		return "Bridge፦ ስልክ ቁጥርዎን ለማረጋገጥ ኮድዎ " + code + " ነው። ለ10 ደቂቃ ይሰራል።"
	}
	return "Bridge: your code to confirm your phone number is " + code + ". It works for 10 minutes."
}
