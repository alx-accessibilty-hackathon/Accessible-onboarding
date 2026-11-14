package domain

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Interfaces that are still empty get their methods as each endpoint is built.
// Rule: use cases depend on these interfaces, never on Repository or Infrastructure types.

// ---- Use cases (called by controllers) ----

type ConfigUsecaseI interface{} // GET /config

// RegistrationUsecaseI: start a sign-up, read it back, save progress and answers, submit.
type RegistrationUsecaseI interface {
	// Start creates a draft learner and registration for the actor's partner and issues a
	// learner token. flowVersion 0 means the latest version of the flow.
	Start(ctx context.Context, actor Actor, flowID string, flowVersion int, language string, simple bool) (reg *Registration, token string, expiresAt time.Time, err error)
	Get(ctx context.Context, actor Actor, id uuid.UUID) (*RegistrationView, error)
	// UpdateProgress changes only the values that are not nil.
	UpdateProgress(ctx context.Context, actor Actor, id uuid.UUID, currentStep, language *string, simple *bool) error
	// SaveAnswer checks the value against the flow step and saves it if baseVersion is the
	// saved version (0 = nothing saved yet). A stale baseVersion returns *ConflictError.
	SaveAnswer(ctx context.Context, actor Actor, regID uuid.UUID, questionID string, value json.RawMessage, inputMethod string, baseVersion int) (*Answer, error)
	Submit(ctx context.Context, actor Actor, regID uuid.UUID) (*SubmitResult, error)
}

// SupportUsecaseI saves a learner's support request (needs), encrypted. Returns when it was saved.
type SupportUsecaseI interface {
	Save(ctx context.Context, actor Actor, regID uuid.UUID, req *SupportRequest) (time.Time, error)
}

type ConsentUsecaseI interface{} // consents
type AuthUsecaseI interface{}    // logout, staff login, OAuth client credentials
type SpeechUsecaseI interface{}  // speech-to-text

// JobUsecaseI: public job list and detail, JobPosting JSON-LD, and the employer's own jobs.
type JobUsecaseI interface {
	// ListJobs returns published jobs, newest first, and the cursor of the next page (nil at the end).
	ListJobs(ctx context.Context, limit int, cursor string) ([]*Job, *string, error)
	GetJob(ctx context.Context, id uuid.UUID) (*Job, error)
	GetJobPosting(ctx context.Context, id uuid.UUID) (map[string]any, error)
	ListEmployerJobs(ctx context.Context, actor Actor) ([]*Job, error)
	CreateEmployerJob(ctx context.Context, actor Actor, job *Job) (*Job, error)
	// PublishEmployerJob returns the published job and the address of its JobPosting JSON-LD.
	PublishEmployerJob(ctx context.Context, actor Actor, id uuid.UUID) (*Job, string, error)
}

// ApplicationUsecaseI submits job applications.
type ApplicationUsecaseI interface {
	Apply(ctx context.Context, actor Actor, app *Application) (*Application, error)
}

type LearnerUsecaseI interface{} // partner API learners (and later /me)

// ---- Repositories (implemented in Repository/) ----

type PartnerRepositoryI interface {
	GetByPublishableKey(ctx context.Context, key string) (*Partner, error) // ErrNotFound if unknown
	ListReferralPartners(ctx context.Context) ([]*Partner, error)
	ListAllowedOrigins(ctx context.Context) ([]string, error) // for the CORS middleware
}
type StaffRepositoryI interface{}

// LearnerRepositoryI: learners, plus the referrals made for them.
type LearnerRepositoryI interface {
	Get(ctx context.Context, id uuid.UUID) (*Learner, error) // ErrNotFound if unknown
	// UpdatePreferences changes only the values that are not nil.
	UpdatePreferences(ctx context.Context, id uuid.UUID, language *string, simple *bool) error
	GetLatestReferral(ctx context.Context, learnerID uuid.UUID) (*Referral, error) // ErrNotFound if none
}

// RegistrationRepositoryI: registrations and their answers.
type RegistrationRepositoryI interface {
	// Start creates the draft learner and its registration in one transaction.
	Start(ctx context.Context, learner *Learner, reg *Registration) (*Learner, *Registration, error)
	Get(ctx context.Context, id uuid.UUID) (*Registration, error) // ErrNotFound if unknown
	UpdateProgress(ctx context.Context, id uuid.UUID, step string) error
	ListAnswers(ctx context.Context, regID uuid.UUID) ([]*Answer, error)
	// SaveAnswerIfVersion returns *ConflictError (with the saved answer) on a stale baseVersion.
	SaveAnswerIfVersion(ctx context.Context, a *Answer, baseVersion int) (*Answer, error)
	// SubmitTx, in one transaction: marks the registration submitted, copies the profile into
	// the learner, stores the identity evidence and the referral (ref may be nil).
	// Returns ErrAlreadySubmitted if the registration isn't a draft any more.
	SubmitTx(ctx context.Context, regID uuid.UUID, profile *Learner, ev *IdentityEvidence, ref *Referral) (*SubmitResult, error)
}

// SupportRepositoryI stores support requests. They arrive already encrypted.
type SupportRepositoryI interface {
	// Upsert replaces the learner's support request and returns when it was saved.
	Upsert(ctx context.Context, learnerID uuid.UUID, nonce, ciphertext []byte, shareCourses, shareEmployers bool) (time.Time, error)
	Exists(ctx context.Context, learnerID uuid.UUID) (bool, error)
}

type ConsentRepositoryI interface{}
type SessionRepositoryI interface{}

// JobRepositoryI: jobs. Public reads only return published jobs; EmployerName is filled in.
type JobRepositoryI interface {
	ListPublished(ctx context.Context, limit int, after *JobCursor) ([]*Job, error)
	GetPublished(ctx context.Context, id uuid.UUID) (*Job, error) // ErrNotFound if missing or not published
	ListByEmployer(ctx context.Context, employerID uuid.UUID) ([]*Job, error)
	Create(ctx context.Context, job *Job) (*Job, error)
	// Publish returns ErrNotFound if the job doesn't exist, isn't this employer's, or is closed.
	Publish(ctx context.Context, id, employerID uuid.UUID) (*Job, error)
}

// ApplicationRepositoryI: job applications.
type ApplicationRepositoryI interface {
	Create(ctx context.Context, app *Application) (*Application, error) // ErrAlreadyExists if applied before
}

// ---- Services (implemented in Infrastructure/ or by another use case) ----

// SecurityService: tokens, hashing, encryption, passwords.
type SecurityService interface {
	// Encrypt seals plaintext with AES-256-GCM. aad ("additional data", e.g. the learner ID)
	// must be given again to decrypt, so ciphertext copied onto another row won't open.
	Encrypt(plaintext []byte, aad string) (nonce, ciphertext []byte, err error)
	Decrypt(nonce, ciphertext []byte, aad string) ([]byte, error)
}

// SessionIssuer creates a learner session and returns its token (shown once, stored hashed).
// Implemented by the auth use case (Dev B).
type SessionIssuer interface {
	IssueLearnerSession(ctx context.Context, learnerID, partnerID uuid.UUID) (token string, expiresAt time.Time, err error)
}

// FlowStore holds the flow files and the needs vocabulary, loaded once at start-up.
type FlowStore interface {
	Flow(flowID string, version int) (*Flow, bool) // version 0 = the latest version
	Step(flowID string, version int, stepID string) (*FlowStep, bool)
	NeedCodes() []string // codes from shared/vocab/needs.json
	IsNeedCode(code string) bool
}

type SpeechService interface{}  // speech-to-text providers (mock, azure, local)
type MessageService interface{} // SMS / Telegram (console provider for the demo)
