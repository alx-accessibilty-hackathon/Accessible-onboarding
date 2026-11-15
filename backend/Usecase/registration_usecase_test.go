package usecase

import (
	"context"
	"testing"
	"time"

	domain "bridge/Domain"
	infrastructure "bridge/Infrastructure"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockSessionRepo struct {
	domain.SessionRepositoryI                 // methods these tests don't use
	createAuthSessionFn                       func(ctx context.Context, session *domain.AuthSession) (*domain.AuthSession, error)
	getAuthSessionByTokenHashFn               func(ctx context.Context, tokenHash []byte) (*domain.AuthSession, error)
	revokeAuthSessionFn                       func(ctx context.Context, id uuid.UUID) error
	createResumeTokenFn                       func(ctx context.Context, registrationID uuid.UUID, tokenHash, codeHash []byte, expiresAt time.Time) (*domain.ResumeToken, error)
	getResumeTokenByCodeHashFn                func(ctx context.Context, codeHash []byte) (*domain.ResumeToken, error)
	getResumeTokenByTokenHashFn               func(ctx context.Context, tokenHash []byte) (*domain.ResumeToken, error)
	incrementResumeTokenFailedAttemptsFn      func(ctx context.Context, id uuid.UUID) (*domain.ResumeToken, error)
	markResumeTokenUsedFn                     func(ctx context.Context, id uuid.UUID) error
	createVerificationCodeFn                  func(ctx context.Context, phoneE164, purpose string, codeHash []byte, learnerID *uuid.UUID, expiresAt time.Time) (*domain.VerificationCode, error)
	getActiveVerificationCodeFn               func(ctx context.Context, phoneE164, purpose string) (*domain.VerificationCode, error)
	incrementVerificationCodeFailedAttemptsFn func(ctx context.Context, id uuid.UUID) (*domain.VerificationCode, error)
	markVerificationCodeUsedFn                func(ctx context.Context, id uuid.UUID) error
	createOutboxMessageFn                     func(ctx context.Context, msg *domain.OutboxMessage) (*domain.OutboxMessage, error)
}

func (m *mockSessionRepo) CreateAuthSession(ctx context.Context, session *domain.AuthSession) (*domain.AuthSession, error) {
	if m.createAuthSessionFn != nil {
		return m.createAuthSessionFn(ctx, session)
	}
	return session, nil
}
func (m *mockSessionRepo) GetAuthSessionByTokenHash(ctx context.Context, tokenHash []byte) (*domain.AuthSession, error) {
	if m.getAuthSessionByTokenHashFn != nil {
		return m.getAuthSessionByTokenHashFn(ctx, tokenHash)
	}
	return nil, domain.ErrNotFound
}
func (m *mockSessionRepo) RevokeAuthSession(ctx context.Context, id uuid.UUID) error {
	if m.revokeAuthSessionFn != nil {
		return m.revokeAuthSessionFn(ctx, id)
	}
	return nil
}
func (m *mockSessionRepo) CreateResumeToken(ctx context.Context, registrationID uuid.UUID, tokenHash, codeHash []byte, expiresAt time.Time) (*domain.ResumeToken, error) {
	if m.createResumeTokenFn != nil {
		return m.createResumeTokenFn(ctx, registrationID, tokenHash, codeHash, expiresAt)
	}
	return nil, nil
}
func (m *mockSessionRepo) GetResumeTokenByCodeHash(ctx context.Context, codeHash []byte) (*domain.ResumeToken, error) {
	if m.getResumeTokenByCodeHashFn != nil {
		return m.getResumeTokenByCodeHashFn(ctx, codeHash)
	}
	return nil, domain.ErrNotFound
}
func (m *mockSessionRepo) GetResumeTokenByTokenHash(ctx context.Context, tokenHash []byte) (*domain.ResumeToken, error) {
	if m.getResumeTokenByTokenHashFn != nil {
		return m.getResumeTokenByTokenHashFn(ctx, tokenHash)
	}
	return nil, domain.ErrNotFound
}
func (m *mockSessionRepo) IncrementResumeTokenFailedAttempts(ctx context.Context, id uuid.UUID) (*domain.ResumeToken, error) {
	if m.incrementResumeTokenFailedAttemptsFn != nil {
		return m.incrementResumeTokenFailedAttemptsFn(ctx, id)
	}
	return nil, nil
}
func (m *mockSessionRepo) MarkResumeTokenUsed(ctx context.Context, id uuid.UUID) error {
	if m.markResumeTokenUsedFn != nil {
		return m.markResumeTokenUsedFn(ctx, id)
	}
	return nil
}
func (m *mockSessionRepo) CreateVerificationCode(ctx context.Context, phoneE164, purpose string, codeHash []byte, learnerID *uuid.UUID, expiresAt time.Time) (*domain.VerificationCode, error) {
	if m.createVerificationCodeFn != nil {
		return m.createVerificationCodeFn(ctx, phoneE164, purpose, codeHash, learnerID, expiresAt)
	}
	return nil, nil
}
func (m *mockSessionRepo) GetActiveVerificationCode(ctx context.Context, phoneE164, purpose string) (*domain.VerificationCode, error) {
	if m.getActiveVerificationCodeFn != nil {
		return m.getActiveVerificationCodeFn(ctx, phoneE164, purpose)
	}
	return nil, domain.ErrNotFound
}
func (m *mockSessionRepo) IncrementVerificationCodeFailedAttempts(ctx context.Context, id uuid.UUID) (*domain.VerificationCode, error) {
	if m.incrementVerificationCodeFailedAttemptsFn != nil {
		return m.incrementVerificationCodeFailedAttemptsFn(ctx, id)
	}
	return nil, nil
}
func (m *mockSessionRepo) MarkVerificationCodeUsed(ctx context.Context, id uuid.UUID) error {
	if m.markVerificationCodeUsedFn != nil {
		return m.markVerificationCodeUsedFn(ctx, id)
	}
	return nil
}
func (m *mockSessionRepo) CreateOutboxMessage(ctx context.Context, msg *domain.OutboxMessage) (*domain.OutboxMessage, error) {
	if m.createOutboxMessageFn != nil {
		return m.createOutboxMessageFn(ctx, msg)
	}
	return msg, nil
}

type mockMessageService struct {
	sent []*domain.Message
}

func (m *mockMessageService) SendMessage(ctx context.Context, msg *domain.Message) error {
	m.sent = append(m.sent, msg)
	return nil
}

func TestRegistrationUsecase_ResumeLookup_SuccessCode(t *testing.T) {
	sec := infrastructure.InitSecurityService("testdatakey1234567890123456789012", "testcodekey1234567890123456789012")
	regID := uuid.New()
	learnerID := uuid.New()
	normCode := "K7M9P2"
	codeHash := sec.HashCode(normCode)

	sessionRepo := &mockSessionRepo{
		getResumeTokenByCodeHashFn: func(ctx context.Context, h []byte) (*domain.ResumeToken, error) {
			assert.Equal(t, codeHash, h)
			return &domain.ResumeToken{
				ID:             uuid.New(),
				RegistrationID: regID,
				CodeHash:       codeHash,
				ExpiresAt:      time.Now().Add(24 * time.Hour),
				FailedAttempts: 0,
			}, nil
		},
	}

	regRepo := &mockRegistrationRepo{
		getRegistrationFn: func(ctx context.Context, id uuid.UUID) (*domain.Registration, error) {
			assert.Equal(t, regID, id)
			return &domain.Registration{
				ID:        regID,
				LearnerID: learnerID,
			}, nil
		},
	}

	dob := time.Date(1995, 4, 12, 0, 0, 0, 0, time.UTC)
	learnerRepo := &mockLearnerRepo{
		getByIDFn: func(ctx context.Context, id uuid.UUID) (*domain.Learner, error) {
			assert.Equal(t, learnerID, id)
			return &domain.Learner{
				ID:  learnerID,
				DOB: &dob,
			}, nil
		},
	}

	uc := NewRegistrationUsecase(learnerRepo, regRepo, nil, nil, nil, nil, sessionRepo, sec, nil)

	res, err := uc.ResumeLookup(context.Background(), "K7M-9P2")
	require.NoError(t, err)
	assert.Equal(t, regID, res.RegistrationID)
	assert.Equal(t, "dob", res.Check)
}

func TestRegistrationUsecase_ResumeLookup_Expired(t *testing.T) {
	sec := infrastructure.InitSecurityService("testdatakey1234567890123456789012", "testcodekey1234567890123456789012")
	regID := uuid.New()
	codeHash := sec.HashCode("K7M9P2")

	sessionRepo := &mockSessionRepo{
		getResumeTokenByCodeHashFn: func(ctx context.Context, h []byte) (*domain.ResumeToken, error) {
			return &domain.ResumeToken{
				ID:             uuid.New(),
				RegistrationID: regID,
				CodeHash:       codeHash,
				ExpiresAt:      time.Now().Add(-1 * time.Hour), // Expired!
			}, nil
		},
	}

	uc := NewRegistrationUsecase(nil, nil, nil, nil, nil, nil, sessionRepo, sec, nil)

	_, err := uc.ResumeLookup(context.Background(), "K7M-9P2")
	require.ErrorIs(t, err, domain.ErrResumeExpired)
}

func TestRegistrationUsecase_ResumeLookup_TooManyAttempts(t *testing.T) {
	sec := infrastructure.InitSecurityService("testdatakey1234567890123456789012", "testcodekey1234567890123456789012")
	regID := uuid.New()
	codeHash := sec.HashCode("K7M9P2")

	sessionRepo := &mockSessionRepo{
		getResumeTokenByCodeHashFn: func(ctx context.Context, h []byte) (*domain.ResumeToken, error) {
			return &domain.ResumeToken{
				ID:             uuid.New(),
				RegistrationID: regID,
				CodeHash:       codeHash,
				ExpiresAt:      time.Now().Add(24 * time.Hour),
				FailedAttempts: 5, // Locked!
			}, nil
		},
	}

	uc := NewRegistrationUsecase(nil, nil, nil, nil, nil, nil, sessionRepo, sec, nil)

	_, err := uc.ResumeLookup(context.Background(), "K7M-9P2")
	require.ErrorIs(t, err, domain.ErrTooManyAttempts)
}

func TestRegistrationUsecase_ResumeVerify_SuccessDOB(t *testing.T) {
	sec := infrastructure.InitSecurityService("testdatakey1234567890123456789012", "testcodekey1234567890123456789012")
	regID := uuid.New()
	learnerID := uuid.New()
	tokenID := uuid.New()
	codeHash := sec.HashCode("K7M9P2")

	markedUsed := false
	sessionCreated := false

	sessionRepo := &mockSessionRepo{
		getResumeTokenByCodeHashFn: func(ctx context.Context, h []byte) (*domain.ResumeToken, error) {
			return &domain.ResumeToken{
				ID:             tokenID,
				RegistrationID: regID,
				CodeHash:       codeHash,
				ExpiresAt:      time.Now().Add(24 * time.Hour),
				FailedAttempts: 0,
			}, nil
		},
		markResumeTokenUsedFn: func(ctx context.Context, id uuid.UUID) error {
			assert.Equal(t, tokenID, id)
			markedUsed = true
			return nil
		},
		createAuthSessionFn: func(ctx context.Context, session *domain.AuthSession) (*domain.AuthSession, error) {
			assert.Equal(t, "learner", session.SubjectType)
			assert.Equal(t, learnerID, session.SubjectID)
			sessionCreated = true
			return session, nil
		},
	}

	regRepo := &mockRegistrationRepo{
		getRegistrationFn: func(ctx context.Context, id uuid.UUID) (*domain.Registration, error) {
			return &domain.Registration{
				ID:        regID,
				LearnerID: learnerID,
			}, nil
		},
	}

	dob := time.Date(2000, 1, 15, 0, 0, 0, 0, time.UTC)
	learnerRepo := &mockLearnerRepo{
		getByIDFn: func(ctx context.Context, id uuid.UUID) (*domain.Learner, error) {
			return &domain.Learner{
				ID:  learnerID,
				DOB: &dob,
			}, nil
		},
	}

	uc := NewRegistrationUsecase(learnerRepo, regRepo, nil, nil, nil, nil, sessionRepo, sec, nil)

	res, attemptsLeft, err := uc.ResumeVerify(context.Background(), "K7M-9P2", &domain.ResumeDOB{
		Year:  2000,
		Month: 1,
		Day:   15,
	}, "")

	require.NoError(t, err)
	assert.Equal(t, 5, attemptsLeft)
	assert.Equal(t, regID, res.RegistrationID)
	assert.True(t, len(res.SessionToken) > 0)
	assert.True(t, markedUsed)
	assert.True(t, sessionCreated)
}

func TestRegistrationUsecase_ResumeVerify_FailedCheck(t *testing.T) {
	sec := infrastructure.InitSecurityService("testdatakey1234567890123456789012", "testcodekey1234567890123456789012")
	regID := uuid.New()
	learnerID := uuid.New()
	tokenID := uuid.New()
	codeHash := sec.HashCode("K7M9P2")

	incremented := false

	sessionRepo := &mockSessionRepo{
		getResumeTokenByCodeHashFn: func(ctx context.Context, h []byte) (*domain.ResumeToken, error) {
			return &domain.ResumeToken{
				ID:             tokenID,
				RegistrationID: regID,
				CodeHash:       codeHash,
				ExpiresAt:      time.Now().Add(24 * time.Hour),
				FailedAttempts: 1,
			}, nil
		},
		incrementResumeTokenFailedAttemptsFn: func(ctx context.Context, id uuid.UUID) (*domain.ResumeToken, error) {
			assert.Equal(t, tokenID, id)
			incremented = true
			return &domain.ResumeToken{
				ID:             tokenID,
				FailedAttempts: 2,
			}, nil
		},
	}

	regRepo := &mockRegistrationRepo{
		getRegistrationFn: func(ctx context.Context, id uuid.UUID) (*domain.Registration, error) {
			return &domain.Registration{
				ID:        regID,
				LearnerID: learnerID,
			}, nil
		},
	}

	dob := time.Date(2000, 1, 15, 0, 0, 0, 0, time.UTC)
	learnerRepo := &mockLearnerRepo{
		getByIDFn: func(ctx context.Context, id uuid.UUID) (*domain.Learner, error) {
			return &domain.Learner{
				ID:  learnerID,
				DOB: &dob,
			}, nil
		},
	}

	uc := NewRegistrationUsecase(learnerRepo, regRepo, nil, nil, nil, nil, sessionRepo, sec, nil)

	// Wrong DOB
	res, attemptsLeft, err := uc.ResumeVerify(context.Background(), "K7M-9P2", &domain.ResumeDOB{
		Year:  1999,
		Month: 12,
		Day:   31,
	}, "")

	require.ErrorIs(t, err, domain.ErrResumeCheckFailed)
	assert.Nil(t, res)
	assert.Equal(t, 3, attemptsLeft) // 5 - 2 = 3
	assert.True(t, incremented)
}

func TestRegistrationUsecase_SendConsentCode_Success(t *testing.T) {
	sec := infrastructure.InitSecurityService("testdatakey1234567890123456789012", "testcodekey1234567890123456789012")
	regID := uuid.New()
	learnerID := uuid.New()
	partnerID := uuid.New()
	phone := "+251912345678"

	codeCreated := false
	outboxCreated := false

	sessionRepo := &mockSessionRepo{
		createVerificationCodeFn: func(ctx context.Context, p, purpose string, hash []byte, lid *uuid.UUID, exp time.Time) (*domain.VerificationCode, error) {
			assert.Equal(t, phone, p)
			assert.Equal(t, "consent", purpose)
			assert.Equal(t, learnerID, *lid)
			codeCreated = true
			return &domain.VerificationCode{
				ID:        uuid.New(),
				PhoneE164: p,
				Purpose:   purpose,
			}, nil
		},
		createOutboxMessageFn: func(ctx context.Context, msg *domain.OutboxMessage) (*domain.OutboxMessage, error) {
			assert.Equal(t, "sms", msg.Channel)
			assert.Equal(t, phone, msg.Recipient)
			outboxCreated = true
			return msg, nil
		},
	}

	regRepo := &mockRegistrationRepo{
		getRegistrationFn: func(ctx context.Context, id uuid.UUID) (*domain.Registration, error) {
			return &domain.Registration{
				ID:        regID,
				LearnerID: learnerID,
			}, nil
		},
	}

	learnerRepo := &mockLearnerRepo{
		getByIDFn: func(ctx context.Context, id uuid.UUID) (*domain.Learner, error) {
			return &domain.Learner{
				ID:        learnerID,
				PartnerID: partnerID,
				PhoneE164: phone,
			}, nil
		},
	}

	msgSvc := &mockMessageService{}
	uc := NewRegistrationUsecase(learnerRepo, regRepo, nil, nil, nil, nil, sessionRepo, sec, msgSvc)

	staff := domain.Actor{Kind: domain.ActorStaff, ID: uuid.New(), Role: domain.RolePartnerStaff, PartnerID: partnerID}
	sentPhone, err := uc.SendConsentCode(context.Background(), staff, regID)
	require.NoError(t, err)
	assert.Equal(t, "+2519•••••678", sentPhone, "the number is masked")
	assert.True(t, codeCreated)
	assert.True(t, outboxCreated)
	require.Len(t, msgSvc.sent, 1)
	assert.Equal(t, phone, msgSvc.sent[0].Recipient)
}

func TestRegistrationUsecase_HandleTelegramWebhook(t *testing.T) {
	sec := infrastructure.InitSecurityService("testdatakey1234567890123456789012", "testcodekey1234567890123456789012")
	sessionRepo := &mockSessionRepo{
		createOutboxMessageFn: func(ctx context.Context, msg *domain.OutboxMessage) (*domain.OutboxMessage, error) {
			assert.Equal(t, "telegram", msg.Channel)
			assert.Equal(t, "12345678", msg.Recipient)
			return msg, nil
		},
	}

	msgSvc := &mockMessageService{}
	uc := NewRegistrationUsecase(nil, nil, nil, nil, nil, nil, sessionRepo, sec, msgSvc)

	update := &domain.TelegramUpdate{
		UpdateID: 1001,
		Message: &domain.TelegramMessage{
			MessageID: 1,
			Chat: domain.TelegramChat{
				ID:   12345678,
				Type: "private",
			},
			Text: "/start",
		},
	}

	err := uc.HandleTelegramWebhook(context.Background(), update)
	require.NoError(t, err)
}
