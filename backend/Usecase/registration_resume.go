package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// Continue on another device (resume link or code), partner consent codes and the Telegram
// bot (Dev B). These are methods of RegistrationUsecase (registration_usecase.go).

func (u *RegistrationUsecase) ResumeLookup(ctx context.Context, codeOrToken string) (*domain.ResumeLookupResult, error) {
	trimmed := strings.TrimSpace(codeOrToken)
	if trimmed == "" {
		return nil, domain.ErrInvalidInput
	}

	tokenRecord, err := u.findResumeToken(ctx, trimmed)
	if err != nil {
		return nil, err
	}

	if tokenRecord.UsedAt != nil || time.Now().After(tokenRecord.ExpiresAt) {
		return nil, domain.ErrResumeExpired
	}

	if tokenRecord.FailedAttempts >= 5 {
		return nil, domain.ErrTooManyAttempts
	}

	reg, err := u.RegistrationRepo.GetRegistrationByID(ctx, tokenRecord.RegistrationID)
	if err != nil {
		return nil, domain.ErrNotFound
	}

	check := "dob"
	learner, _ := u.LearnerRepo.GetByID(ctx, reg.LearnerID)
	if learner != nil {
		if learner.DOB != nil {
			check = "dob"
		} else if learner.PhoneE164 != "" {
			check = "phone"
		} else {
			if ans, _ := u.RegistrationRepo.GetAnswer(ctx, reg.ID, "dob"); ans != nil && len(ans.Value) > 0 {
				check = "dob"
			} else if ans, _ := u.RegistrationRepo.GetAnswer(ctx, reg.ID, "phone"); ans != nil && len(ans.Value) > 0 {
				check = "phone"
			}
		}
	}

	return &domain.ResumeLookupResult{
		RegistrationID: reg.ID,
		Check:          check,
	}, nil
}

func (u *RegistrationUsecase) ResumeVerify(ctx context.Context, codeOrToken string, dob *domain.ResumeDOB, phoneLast4 string) (*domain.ResumeVerifyResult, int, error) {
	trimmed := strings.TrimSpace(codeOrToken)
	if trimmed == "" {
		return nil, 0, domain.ErrInvalidInput
	}

	tokenRecord, err := u.findResumeToken(ctx, trimmed)
	if err != nil {
		return nil, 0, err
	}

	if tokenRecord.UsedAt != nil || time.Now().After(tokenRecord.ExpiresAt) {
		return nil, 0, domain.ErrResumeExpired
	}

	if tokenRecord.FailedAttempts >= 5 {
		return nil, 0, domain.ErrTooManyAttempts
	}

	reg, err := u.RegistrationRepo.GetRegistrationByID(ctx, tokenRecord.RegistrationID)
	if err != nil {
		return nil, 0, domain.ErrNotFound
	}

	learner, _ := u.LearnerRepo.GetByID(ctx, reg.LearnerID)

	matched := false
	if dob != nil && dob.Year > 0 {
		if want, ok := resumeDOBDay(dob); ok && learner != nil && learner.DOB != nil {
			d := learner.DOB.UTC()
			matched = time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC).Equal(want)
		}
		if !matched {
			if ans, _ := u.RegistrationRepo.GetAnswer(ctx, reg.ID, "dob"); ans != nil {
				matched = checkDOBAnswerMatch(ans.Value, dob)
			}
		}
	}

	// Exactly 4 digits: a shorter suffix ("8") would match far too often.
	if !matched && isFourDigits(strings.TrimSpace(phoneLast4)) {
		phoneLast4 = strings.TrimSpace(phoneLast4)
		if learner != nil && learner.PhoneE164 != "" {
			clean := strings.ReplaceAll(learner.PhoneE164, " ", "")
			if strings.HasSuffix(clean, phoneLast4) {
				matched = true
			}
		}
		if !matched {
			if ans, _ := u.RegistrationRepo.GetAnswer(ctx, reg.ID, "phone"); ans != nil {
				var phoneStr string
				if err := json.Unmarshal(ans.Value, &phoneStr); err == nil {
					clean := strings.ReplaceAll(phoneStr, " ", "")
					if strings.HasSuffix(clean, phoneLast4) {
						matched = true
					}
				}
			}
		}
	}

	if !matched {
		updated, _ := u.SessionRepo.IncrementResumeTokenFailedAttempts(ctx, tokenRecord.ID)
		attempts := tokenRecord.FailedAttempts + 1
		if updated != nil {
			attempts = updated.FailedAttempts
		}
		attemptsLeft := 5 - attempts
		if attemptsLeft < 0 {
			attemptsLeft = 0
		}
		return nil, attemptsLeft, domain.ErrResumeCheckFailed
	}

	if err := u.SessionRepo.MarkResumeTokenUsed(ctx, tokenRecord.ID); err != nil {
		return nil, 0, err
	}

	sessionToken, hash, err := u.Security.NewToken("lt_")
	if err != nil {
		return nil, 0, err
	}
	expiresAt := time.Now().Add(30 * 24 * time.Hour)

	authSession := &domain.AuthSession{
		SubjectType: "learner",
		SubjectID:   reg.LearnerID,
		TokenHash:   hash,
		ExpiresAt:   expiresAt,
	}
	if _, err := u.SessionRepo.CreateAuthSession(ctx, authSession); err != nil {
		return nil, 0, err
	}

	return &domain.ResumeVerifyResult{
		RegistrationID: reg.ID,
		SessionToken:   sessionToken,
		ExpiresAt:      expiresAt,
	}, 5, nil
}

// SendConsentCode texts a 6-digit code to the learner's stored phone, so partner staff can
// record the learner's consent (E1). Only staff of the learner's own partner, or of the
// organisation the learner was referred to, may do this. The phone comes from the learner's
// record, never from the request, and the result is masked.
func (u *RegistrationUsecase) SendConsentCode(ctx context.Context, actor domain.Actor, registrationID uuid.UUID) (string, error) {
	if actor.IsAnonymous() {
		return "", domain.ErrUnauthorized
	}
	if actor.Kind != domain.ActorStaff || actor.Role != domain.RolePartnerStaff || actor.PartnerID == uuid.Nil {
		return "", domain.ErrForbidden
	}
	reg, err := u.RegistrationRepo.GetRegistrationByID(ctx, registrationID)
	if err != nil {
		return "", err
	}
	learner, err := u.LearnerRepo.GetByID(ctx, reg.LearnerID)
	if err != nil {
		return "", err
	}
	if learner.PartnerID != actor.PartnerID {
		ref, err := u.LearnerRepo.GetLatestReferral(ctx, learner.ID)
		if err != nil || ref.PartnerID != actor.PartnerID {
			return "", domain.ErrForbidden
		}
	}

	phone := learner.PhoneE164
	if phone == "" {
		if ans, _ := u.RegistrationRepo.GetAnswer(ctx, reg.ID, "phone"); ans != nil {
			_ = json.Unmarshal(ans.Value, &phone)
			phone = strings.TrimSpace(phone)
		}
	}
	if phone == "" {
		return "", domain.NewValidationError("phone", "required")
	}

	code, hash, err := u.Security.NewVerificationCode()
	if err != nil {
		return "", err
	}
	expiresAt := time.Now().Add(10 * time.Minute)
	if _, err := u.SessionRepo.CreateVerificationCode(ctx, phone, "consent", hash, &reg.LearnerID, expiresAt); err != nil {
		return "", err
	}
	u.sendSMS(ctx, phone, fmt.Sprintf("Bridge: your consent code is %s. It works for 10 minutes. Only give it to the person helping you if you agree.", code))
	return maskPhone(phone), nil
}

// CreateResumeLink makes a link and a short code to continue on another device (R15). Both
// are stored only as hashes and work for 72 hours. sendVia "sms" also texts them.
func (u *RegistrationUsecase) CreateResumeLink(ctx context.Context, actor domain.Actor, regID uuid.UUID, sendVia, phone string) (*domain.ResumeLink, error) {
	reg, err := loadOwnedRegistration(ctx, u.RegistrationRepo, actor, regID)
	if err != nil {
		return nil, err
	}
	if reg.Status != domain.RegistrationStatusDraft {
		return nil, domain.ErrAlreadySubmitted
	}
	switch sendVia {
	case "", "none", "sms":
	default:
		return nil, domain.NewValidationError("send_via", codeInvalidChoice)
	}

	token, tokenHash, err := u.Security.NewToken("k_")
	if err != nil {
		return nil, err
	}
	display, normalized, err := u.Security.NewResumeCode()
	if err != nil {
		return nil, err
	}
	expiresAt := time.Now().UTC().Add(72 * time.Hour)
	if _, err := u.SessionRepo.CreateResumeToken(ctx, reg.ID, tokenHash, u.Security.HashCode(normalized), expiresAt); err != nil {
		return nil, err
	}

	link := &domain.ResumeLink{URL: u.PublicURL + "/r/" + token, Code: display, ExpiresAt: expiresAt}
	if sendVia == "sms" {
		to, ok := normalizeEthiopianPhone(phone)
		if !ok {
			learner, err := u.LearnerRepo.GetByID(ctx, reg.LearnerID)
			if err == nil && learner.PhoneE164 != "" {
				to, ok = learner.PhoneE164, true
			} else if ans, _ := u.RegistrationRepo.GetAnswer(ctx, reg.ID, "phone"); ans != nil {
				var p string
				_ = json.Unmarshal(ans.Value, &p)
				to, ok = normalizeEthiopianPhone(p)
			}
		}
		if !ok {
			return nil, domain.NewValidationError("phone", codePhoneInvalid)
		}
		u.sendSMS(ctx, to, fmt.Sprintf("Bridge: continue your sign-up at %s  Code: %s (works for 3 days)", link.URL, display))
		link.Channel, link.Status = "sms", "queued"
	}
	return link, nil
}

// sendSMS keeps a message in the outbox (with the console provider, the simulated inbox,
// GET /dev/messages) and hands it to the message service (notify.go).
func (u *RegistrationUsecase) sendSMS(ctx context.Context, phone, body string) {
	var outbox outboxWriter
	if u.SessionRepo != nil {
		outbox = u.SessionRepo
	}
	queueSMS(ctx, outbox, u.Messages, phone, body)
}

// maskPhone shows only the start and the last 3 digits: "+251912345678" → "+2519•••••678".
func maskPhone(p string) string {
	if len(p) <= 8 {
		return "•••"
	}
	return p[:5] + strings.Repeat("•", len(p)-8) + p[len(p)-3:]
}

func isFourDigits(s string) bool {
	if len(s) != 4 {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func (u *RegistrationUsecase) HandleTelegramWebhook(ctx context.Context, update *domain.TelegramUpdate) error {
	if update == nil || update.Message == nil {
		return nil
	}

	text := strings.TrimSpace(update.Message.Text)
	if !strings.HasPrefix(text, "/start") {
		return nil
	}

	parts := strings.Fields(text)
	chatIDStr := fmt.Sprintf("%d", update.Message.Chat.ID)
	replyBody := "Welcome to Bridge! Visit our portal to register or verify your onboarding session."

	if len(parts) > 1 {
		payload := parts[1]
		tokenRecord, _ := u.findResumeToken(ctx, payload)
		if tokenRecord != nil && tokenRecord.UsedAt == nil && time.Now().Before(tokenRecord.ExpiresAt) {
			replyBody = "Welcome back to Bridge! Continue your sign-up by verifying your date of birth or last 4 phone digits."
		}
	}

	provider := "telegram"
	outbox := &domain.OutboxMessage{
		Channel:   "telegram",
		Recipient: chatIDStr,
		Body:      replyBody,
		Status:    "queued",
		Provider:  &provider,
	}
	_, _ = u.SessionRepo.CreateOutboxMessage(ctx, outbox)

	if u.Messages != nil {
		_ = u.Messages.SendMessage(ctx, &domain.Message{
			Channel:   "telegram",
			Recipient: chatIDStr,
			Body:      replyBody,
		})
	}

	return nil
}

func (u *RegistrationUsecase) findResumeToken(ctx context.Context, input string) (*domain.ResumeToken, error) {
	if strings.HasPrefix(input, "r_") || strings.HasPrefix(input, "k_") || len(input) > 10 {
		tokenHash := u.Security.HashToken(input)
		rec, err := u.SessionRepo.GetResumeTokenByTokenHash(ctx, tokenHash)
		if err == nil && rec != nil {
			return rec, nil
		}
	}

	norm := u.Security.NormalizeCode(input)
	codeHash := u.Security.HashCode(norm)
	rec, err := u.SessionRepo.GetResumeTokenByCodeHash(ctx, codeHash)
	if err == nil && rec != nil {
		return rec, nil
	}

	tokenHash := u.Security.HashToken(input)
	rec, err = u.SessionRepo.GetResumeTokenByTokenHash(ctx, tokenHash)
	if err == nil && rec != nil {
		return rec, nil
	}

	return nil, domain.ErrNotFound
}

// resumeDOBDay turns the date the person typed (Ethiopian or Gregorian) into one calendar day.
func resumeDOBDay(d *domain.ResumeDOB) (time.Time, bool) {
	if strings.EqualFold(d.Calendar, calendarEthiopian) {
		return ethiopianToGregorian(d.Year, d.Month, d.Day)
	}
	t := time.Date(d.Year, time.Month(d.Month), d.Day, 0, 0, 0, 0, time.UTC)
	if t.Year() != d.Year || int(t.Month()) != d.Month || t.Day() != d.Day {
		return time.Time{}, false // e.g. 30 February
	}
	return t, true
}

// checkDOBAnswerMatch compares the typed date with the saved dob answer, which is stored as
// {calendar, ethiopian?, iso} (or a plain ISO string). Both sides are compared as one day.
func checkDOBAnswerMatch(data []byte, expected *domain.ResumeDOB) bool {
	want, ok := resumeDOBDay(expected)
	if !ok {
		return false
	}
	saved, _ := answerDate(data)
	return saved != nil && saved.Equal(want)
}

// DevMessages lists the simulated messages, newest last (GET /dev/messages, development only).
func (u *RegistrationUsecase) DevMessages(ctx context.Context) ([]*domain.OutboxMessage, error) {
	return u.SessionRepo.ListOutboxMessages(ctx)
}
