package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Interfaces are empty on purpose: add methods as you implement each endpoint
// (PartnerRepositoryI shows the pattern).
// Rule: use cases depend on these interfaces, never on Repository or Infrastructure types.

// ---- Use cases (called by controllers) ----

type ConfigUsecaseI interface {
	GetConfig(ctx context.Context, partnerKey string) (*ClientConfig, error)
}
type RegistrationUsecaseI interface {
	ResumeLookup(ctx context.Context, codeOrToken string) (*ResumeLookupResult, error)
	ResumeVerify(ctx context.Context, codeOrToken string, dob *ResumeDOB, phoneLast4 string) (*ResumeVerifyResult, int, error)
	SendConsentCode(ctx context.Context, registrationID uuid.UUID, phone string) (string, error)
	HandleTelegramWebhook(ctx context.Context, update *TelegramUpdate) error
}
type SupportUsecaseI interface{} // support request (encrypted)
type ConsentUsecaseI interface {
	CreateConsent(ctx context.Context, registrationID uuid.UUID, consent *Consent) (*Consent, error)
}
type AuthUsecaseI interface{} // logout, staff login, OAuth client credentials
type SpeechUsecaseI interface {
	Transcribe(ctx context.Context, audio []byte, language string, stepID string, fieldType string, learnerID *uuid.UUID) (*Transcription, error)
}
type JobUsecaseI interface{}         // public jobs, JobPosting, employer jobs
type ApplicationUsecaseI interface{} // job applications
type LearnerUsecaseI interface {
	GetPartnerLearner(ctx context.Context, partnerID *uuid.UUID, learnerID uuid.UUID) (*Learner, error)
}

// ---- Repositories (implemented in Repository/) ----

type PartnerRepositoryI interface {
	GetByPublishableKey(ctx context.Context, key string) (*Partner, error) // ErrNotFound if unknown
	ListReferralPartners(ctx context.Context) ([]*Partner, error)
	ListAllowedOrigins(ctx context.Context) ([]string, error) // for the CORS middleware
}
type StaffRepositoryI interface{}
type LearnerRepositoryI interface {
	GetByID(ctx context.Context, id uuid.UUID) (*Learner, error)
	GetByIDAndPartnerID(ctx context.Context, id uuid.UUID, partnerID uuid.UUID) (*Learner, error)
	ListByPartnerID(ctx context.Context, partnerID uuid.UUID) ([]*Learner, error)
}
type RegistrationRepositoryI interface {
	GetRegistrationByID(ctx context.Context, id uuid.UUID) (*Registration, error)
	GetAnswer(ctx context.Context, registrationID uuid.UUID, questionID string) (*Answer, error)
	ListAnswersByRegistrationID(ctx context.Context, registrationID uuid.UUID) ([]*Answer, error)
}
type SupportRepositoryI interface{}
type ConsentRepositoryI interface {
	CreateConsent(ctx context.Context, consent *Consent) (*Consent, error)
	GetConsentByLearnerAndKind(ctx context.Context, learnerID uuid.UUID, kind string) (*Consent, error)
	ListConsentsByLearnerID(ctx context.Context, learnerID uuid.UUID) ([]*Consent, error)
}
type SessionRepositoryI interface {
	CreateAuthSession(ctx context.Context, session *AuthSession) (*AuthSession, error)
	GetAuthSessionByTokenHash(ctx context.Context, tokenHash []byte) (*AuthSession, error)
	RevokeAuthSession(ctx context.Context, id uuid.UUID) error

	CreateResumeToken(ctx context.Context, registrationID uuid.UUID, tokenHash, codeHash []byte, expiresAt time.Time) (*ResumeToken, error)
	GetResumeTokenByCodeHash(ctx context.Context, codeHash []byte) (*ResumeToken, error)
	GetResumeTokenByTokenHash(ctx context.Context, tokenHash []byte) (*ResumeToken, error)
	IncrementResumeTokenFailedAttempts(ctx context.Context, id uuid.UUID) (*ResumeToken, error)
	MarkResumeTokenUsed(ctx context.Context, id uuid.UUID) error

	CreateVerificationCode(ctx context.Context, phoneE164, purpose string, codeHash []byte, learnerID *uuid.UUID, expiresAt time.Time) (*VerificationCode, error)
	GetActiveVerificationCode(ctx context.Context, phoneE164, purpose string) (*VerificationCode, error)
	IncrementVerificationCodeFailedAttempts(ctx context.Context, id uuid.UUID) (*VerificationCode, error)
	MarkVerificationCodeUsed(ctx context.Context, id uuid.UUID) error

	CreateOutboxMessage(ctx context.Context, msg *OutboxMessage) (*OutboxMessage, error)
}
type JobRepositoryI interface{}
type ApplicationRepositoryI interface{}

// ---- Services (implemented in Infrastructure/) ----

type SecurityService interface {
	NewToken(prefix string) (token string, hash []byte, err error)
	HashToken(token string) []byte
	NewResumeCode() (display string, normalized string, err error)
	NormalizeCode(code string) string
	HashCode(normalized string) []byte
	NewVerificationCode() (code string, hash []byte, err error)
}
type SpeechService interface {
	HasServerSpeech() bool
	HasCloudSpeech() bool
	Transcribe(ctx context.Context, audio []byte, language string, cloudConsent bool) (*Transcription, error)
}
type MessageService interface {
	SendMessage(ctx context.Context, msg *Message) error
}
