package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// RegistrationUsecase: start a registration (issues a learner token), get it,
// save progress, save answers (version check), submit, and handle cross-device resume.
type RegistrationUsecase struct {
	LearnerRepo      domain.LearnerRepositoryI
	RegistrationRepo domain.RegistrationRepositoryI
	SessionRepo      domain.SessionRepositoryI
	Security         domain.SecurityService
	Messages         domain.MessageService
}

var _ domain.RegistrationUsecaseI = (*RegistrationUsecase)(nil)

func NewRegistrationUsecase(
	lrp domain.LearnerRepositoryI,
	rrp domain.RegistrationRepositoryI,
	srp domain.SessionRepositoryI,
	sec domain.SecurityService,
	msg domain.MessageService,
) *RegistrationUsecase {
	return &RegistrationUsecase{
		LearnerRepo:      lrp,
		RegistrationRepo: rrp,
		SessionRepo:      srp,
		Security:         sec,
		Messages:         msg,
	}
}

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
		if learner != nil && learner.DOB != nil {
			if learner.DOB.Year() == dob.Year && int(learner.DOB.Month()) == dob.Month && learner.DOB.Day() == dob.Day {
				matched = true
			}
		}
		if !matched {
			if ans, _ := u.RegistrationRepo.GetAnswer(ctx, reg.ID, "dob"); ans != nil {
				matched = checkDOBAnswerMatch(ans.Value, dob)
			}
		}
	}

	if !matched && phoneLast4 != "" {
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

	_ = u.SessionRepo.MarkResumeTokenUsed(ctx, tokenRecord.ID)

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

func (u *RegistrationUsecase) SendConsentCode(ctx context.Context, registrationID uuid.UUID, phone string) (string, error) {
	reg, err := u.RegistrationRepo.GetRegistrationByID(ctx, registrationID)
	if err != nil {
		return "", err
	}

	phone = strings.TrimSpace(phone)
	if phone == "" {
		learner, _ := u.LearnerRepo.GetByID(ctx, reg.LearnerID)
		if learner != nil && learner.PhoneE164 != "" {
			phone = learner.PhoneE164
		} else if ans, _ := u.RegistrationRepo.GetAnswer(ctx, reg.ID, "phone"); ans != nil {
			var p string
			_ = json.Unmarshal(ans.Value, &p)
			phone = strings.TrimSpace(p)
		}
	}

	if phone == "" {
		return "", errors.New("no phone number available for consent code")
	}

	code, hash, err := u.Security.NewVerificationCode()
	if err != nil {
		return "", err
	}

	expiresAt := time.Now().Add(10 * time.Minute)
	if _, err := u.SessionRepo.CreateVerificationCode(ctx, phone, "consent", hash, &reg.LearnerID, expiresAt); err != nil {
		return "", err
	}

	body := fmt.Sprintf("Bridge: your consent verification code is %s. Valid for 10 minutes.", code)
	provider := "console"
	outbox := &domain.OutboxMessage{
		Channel:   "sms",
		Recipient: phone,
		Body:      body,
		Status:    "queued",
		Provider:  &provider,
	}
	_, _ = u.SessionRepo.CreateOutboxMessage(ctx, outbox)

	if u.Messages != nil {
		_ = u.Messages.SendMessage(ctx, &domain.Message{
			Channel:   "sms",
			Recipient: phone,
			Body:      body,
		})
	}

	return phone, nil
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

func checkDOBAnswerMatch(data []byte, expected *domain.ResumeDOB) bool {
	var obj struct {
		Calendar string `json:"calendar"`
		Year     int    `json:"year"`
		Month    int    `json:"month"`
		Day      int    `json:"day"`
	}
	if err := json.Unmarshal(data, &obj); err == nil {
		if obj.Year == expected.Year && obj.Month == expected.Month && obj.Day == expected.Day {
			return true
		}
	}

	var str string
	if err := json.Unmarshal(data, &str); err == nil {
		if parsed, err := time.Parse("2006-01-02", str); err == nil {
			if parsed.Year() == expected.Year && int(parsed.Month()) == expected.Month && parsed.Day() == expected.Day {
				return true
			}
		}
	}

	return false
}
