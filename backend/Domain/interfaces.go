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

type ConfigUsecaseI interface {
	GetConfig(ctx context.Context, partnerKey string) (*ClientConfig, error)
}

// RegistrationUsecaseI: start a sign-up, read it back, save progress and answers, submit
// (Dev A), and continue on another device, consent codes and Telegram (Dev B).
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

	ResumeLookup(ctx context.Context, codeOrToken string) (*ResumeLookupResult, error)
	ResumeVerify(ctx context.Context, codeOrToken string, dob *ResumeDOB, phoneLast4 string) (*ResumeVerifyResult, int, error)
	// CreateResumeLink makes a link and a short code to continue on another device (R15),
	// optionally sending them by SMS or Telegram.
	CreateResumeLink(ctx context.Context, actor Actor, regID uuid.UUID, sendVia, phone string) (*ResumeLink, error)
	// SendConsentCode texts a consent code to the learner's stored phone (partner staff, E1).
	// It returns the phone number masked, e.g. "+2519•••••678".
	SendConsentCode(ctx context.Context, actor Actor, registrationID uuid.UUID) (string, error)
	HandleTelegramWebhook(ctx context.Context, update *TelegramUpdate) error
	// DevMessages lists the simulated SMS / Telegram messages (development only).
	DevMessages(ctx context.Context) ([]*OutboxMessage, error)
}

// SupportUsecaseI saves a learner's support request (needs), encrypted. Returns when it was saved.
type SupportUsecaseI interface {
	Save(ctx context.Context, actor Actor, regID uuid.UUID, req *SupportRequest) (time.Time, error)
}

type ConsentUsecaseI interface {
	CreateConsent(ctx context.Context, actor Actor, registrationID uuid.UUID, consent *Consent) (*Consent, error)
}

// AuthUsecaseI: tokens for learners, staff and partner servers.
type AuthUsecaseI interface {
	// ResolveToken turns a bearer token into the caller. ErrUnauthorized if unknown, expired or revoked.
	ResolveToken(ctx context.Context, token string) (*Actor, error)
	Logout(ctx context.Context, token string) error
	// StaffLogin gives the same ErrUnauthorized for a wrong email and a wrong password.
	StaffLogin(ctx context.Context, email, password string) (token string, expiresAt time.Time, staff *StaffUser, err error)
	StaffMe(ctx context.Context, actor Actor) (*StaffUser, error)
	// IssuePartnerToken: OAuth 2.0 client credentials. Returns the token, its lifetime in
	// seconds and the granted scope.
	IssuePartnerToken(ctx context.Context, clientID, secret, scope string) (token string, expiresIn int, granted string, err error)
}
type SpeechUsecaseI interface {
	Transcribe(ctx context.Context, audio []byte, language string, stepID string, fieldType string, learnerID *uuid.UUID) (*Transcription, error)
	// Synthesize reads fixed interface text aloud (MP3). ErrSpeechUnavailable when no voice exists.
	Synthesize(ctx context.Context, text, language string) ([]byte, error)
}

// JobUsecaseI: public job list and detail, JobPosting JSON-LD, and the employer's own jobs.
type JobUsecaseI interface {
	// ListJobs returns published jobs, newest first, and the cursor of the next page (nil at the end).
	ListJobs(ctx context.Context, limit int, cursor string) ([]*Job, *string, error)
	GetJob(ctx context.Context, id uuid.UUID) (*Job, error)
	GetJobPosting(ctx context.Context, id uuid.UUID) (map[string]any, error)
	// AccommodationsVocabulary is the JSON-LD document that defines the "acc" prefix of a JobPosting.
	AccommodationsVocabulary() map[string]any
	ListEmployerJobs(ctx context.Context, actor Actor) ([]*Job, error)
	CreateEmployerJob(ctx context.Context, actor Actor, job *Job) (*Job, error)
	// PublishEmployerJob returns the published job and the address of its JobPosting JSON-LD.
	PublishEmployerJob(ctx context.Context, actor Actor, id uuid.UUID) (*Job, string, error)
}

// ApplicationUsecaseI submits job applications.
type ApplicationUsecaseI interface {
	Apply(ctx context.Context, actor Actor, app *Application) (*Application, error)
	// ListMine: the signed-in learner's applications (support passport), newest first.
	ListMine(ctx context.Context, actor Actor) ([]*LearnerApplication, error)
	// SetSupportSharing shares (or stops sharing) the learner's support needs with the employer
	// of one of their applications. Another learner's application is ErrNotFound.
	SetSupportSharing(ctx context.Context, actor Actor, applicationID uuid.UUID, share bool) (*LearnerApplication, error)
}

// LearnerUsecaseI: the partner API (level 2). partnerID is the calling partner server's ID;
// nil means no partner server is signed in (ErrForbidden).
type LearnerUsecaseI interface {
	GetPartnerLearner(ctx context.Context, partnerID *uuid.UUID, learnerID uuid.UUID) (*Learner, error)
	ListPartnerLearners(ctx context.Context, partnerID *uuid.UUID, updatedSince *time.Time, limit int) ([]*Learner, error)
}

// MeUsecaseI: the signed-in learner's own data: see, change, delete (Q4).
type MeUsecaseI interface {
	Get(ctx context.Context, actor Actor) (*LearnerProfile, error)
	// Export returns all personal data and history stored for the learner.
	Export(ctx context.Context, actor Actor) (*LearnerExport, error)
	// Update changes only the values that are not nil; ErrNotRegistered if a draft learner
	// sends anything but language and simple mode.
	Update(ctx context.Context, actor Actor, changes *ProfileChanges) (*LearnerProfile, error)
	// Delete removes the learner and everything about them, and ends all their sessions.
	Delete(ctx context.Context, actor Actor) error
}

// ReferralUsecaseI: the referral queue of a referral organisation's staff (R7).
type ReferralUsecaseI interface {
	ListPartnerReferrals(ctx context.Context, actor Actor) ([]*PartnerReferral, error)
	// UpdatePartnerReferral: another partner's referral is ErrNotFound.
	UpdatePartnerReferral(ctx context.Context, actor Actor, id uuid.UUID, status string) (*PartnerReferral, error)
	// MakeVouchCode (partner staff): a one-time code to vouch for the learner of this referral.
	// confirmed is the staff member's statement that they met or spoke with the person.
	MakeVouchCode(ctx context.Context, actor Actor, referralID uuid.UUID, confirmed bool) (*VouchCodeIssued, error)
	// ConfirmVouch (the learner): enter the code; the learner becomes "confirmed by a partner".
	ConfirmVouch(ctx context.Context, actor Actor, code string) (*Vouched, error)
}

// EmployerApplicationUsecaseI: applications to the signed-in employer's own jobs (C3, Q7).
type EmployerApplicationUsecaseI interface {
	// ListJobApplications: another employer's job is ErrNotFound.
	ListJobApplications(ctx context.Context, actor Actor, jobID uuid.UUID) ([]*EmployerApplication, error)
}

// ---- Repositories (implemented in Repository/) ----

type PartnerRepositoryI interface {
	GetByPublishableKey(ctx context.Context, key string) (*Partner, error) // ErrNotFound if unknown
	ListReferralPartners(ctx context.Context) ([]*Partner, error)
	ListAllowedOrigins(ctx context.Context) ([]string, error) // for the CORS middleware
	GetByID(ctx context.Context, id uuid.UUID) (*Partner, error)
	// GetByClientID returns the partner and the SHA-256 hash of its OAuth client secret.
	GetByClientID(ctx context.Context, clientID string) (*Partner, []byte, error)
}

// StaffRepositoryI: staff accounts. ErrNotFound if unknown.
type StaffRepositoryI interface {
	GetByEmail(ctx context.Context, email string) (*StaffUser, error)
	GetByID(ctx context.Context, id uuid.UUID) (*StaffUser, error)
}

// LearnerRepositoryI: learners, plus the referrals made for them.
type LearnerRepositoryI interface {
	GetByID(ctx context.Context, id uuid.UUID) (*Learner, error) // ErrNotFound if unknown
	GetByIDAndPartnerID(ctx context.Context, id uuid.UUID, partnerID uuid.UUID) (*Learner, error)
	ListByPartnerID(ctx context.Context, partnerID uuid.UUID) ([]*Learner, error)
	// UpdatePreferences changes only the values that are not nil.
	UpdatePreferences(ctx context.Context, id uuid.UUID, language *string, simple *bool) error
	GetLatestReferral(ctx context.Context, learnerID uuid.UUID) (*Referral, error) // ErrNotFound if none
}

// RegistrationRepositoryI: registrations and their answers.
type RegistrationRepositoryI interface {
	GetRegistrationByID(ctx context.Context, id uuid.UUID) (*Registration, error) // ErrNotFound if unknown
	GetAnswer(ctx context.Context, registrationID uuid.UUID, questionID string) (*Answer, error)
	ListAnswersByRegistrationID(ctx context.Context, registrationID uuid.UUID) ([]*Answer, error)
	// Start creates the draft learner and its registration in one transaction.
	Start(ctx context.Context, learner *Learner, reg *Registration) (*Learner, *Registration, error)
	UpdateProgress(ctx context.Context, id uuid.UUID, step string) error
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

type ConsentRepositoryI interface {
	CreateConsent(ctx context.Context, consent *Consent) (*Consent, error)
	GetConsentByLearnerAndKind(ctx context.Context, learnerID uuid.UUID, kind string) (*Consent, error)
	ListConsentsByLearnerID(ctx context.Context, learnerID uuid.UUID) ([]*Consent, error)
}
type SessionRepositoryI interface {
	CreateAuthSession(ctx context.Context, session *AuthSession) (*AuthSession, error)
	GetAuthSessionByTokenHash(ctx context.Context, tokenHash []byte) (*AuthSession, error)
	RevokeAuthSession(ctx context.Context, id uuid.UUID) error
	// TouchAuthSession records a use; newExpiry (learner sessions) slides the expiry, nil keeps it.
	TouchAuthSession(ctx context.Context, id uuid.UUID, newExpiry *time.Time) error

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
	ListOutboxMessages(ctx context.Context) ([]*OutboxMessage, error) // the simulated inbox (dev)
}

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
	ListForLearner(ctx context.Context, learnerID uuid.UUID) ([]*LearnerApplication, error)
	// SetSupportSharing: ErrNotFound unless the application is this learner's.
	SetSupportSharing(ctx context.Context, learnerID, applicationID uuid.UUID, share bool) error
}

// ProfileRepositoryI: what /me reads, changes and deletes. ErrNotFound when there is no row.
type ProfileRepositoryI interface {
	GetLatestRegistration(ctx context.Context, learnerID uuid.UUID) (*Registration, error)
	GetLatestIdentityEvidence(ctx context.Context, learnerID uuid.UUID) (*IdentityEvidence, error)
	GetSealedSupportRequest(ctx context.Context, learnerID uuid.UUID) (*SealedSupportRequest, error)
	// UpdateProfile writes the learner's name, contact, phone, date of birth, language and
	// simple mode. A cleared phone is also removed from the learner's saved answers.
	UpdateProfile(ctx context.Context, l *Learner) (*Learner, error)
	// DeleteLearner, in one transaction: deletes the learner (the rest cascades), their
	// sessions, and writes the audit entry.
	DeleteLearner(ctx context.Context, learnerID uuid.UUID, audit *AuditEntry) error
}

// ReferralRepositoryI: referrals with their learner, for the referral partner's staff.
type ReferralRepositoryI interface {
	// Get returns ErrNotFound if the referral doesn't exist or isn't this partner's.
	Get(ctx context.Context, id, partnerID uuid.UUID) (*PartnerReferral, error)
	ListByPartner(ctx context.Context, partnerID uuid.UUID) ([]*PartnerReferral, error) // newest first
	// UpdateStatus returns ErrNotFound if the referral doesn't exist or isn't this partner's.
	UpdateStatus(ctx context.Context, id, partnerID uuid.UUID, status string) (*PartnerReferral, error)
}

// EmployerApplicationRepositoryI: applications to one job of one employer, newest first,
// with the applicant and (only when attach_support) the sealed support request.
type EmployerApplicationRepositoryI interface {
	ListForEmployerJob(ctx context.Context, jobID, employerID uuid.UUID) ([]*EmployerApplication, error)
}

// VouchRepositoryI: one-time codes for the trusted referral.
type VouchRepositoryI interface {
	// Create retires the referral's older unused codes and stores the new one (with an audit row).
	Create(ctx context.Context, code *VouchCode, audit *AuditEntry) error
	// Active is the learner's newest unused code (ErrNotFound if none).
	Active(ctx context.Context, learnerID uuid.UUID) (*VouchCode, error)
	// AddFailure counts a wrong try and returns the total.
	AddFailure(ctx context.Context, id uuid.UUID) (int, error)
	// Attest uses the code and, in one transaction, makes the learner "confirmed by a partner"
	// (learner, latest identity evidence, referral "attested", audit row). ErrNotFound if the
	// code was used meanwhile.
	Attest(ctx context.Context, code *VouchCode, audit *AuditEntry) error
}

// AuditRepositoryI writes audit_log rows.
type AuditRepositoryI interface {
	Log(ctx context.Context, e *AuditEntry) error
}

// ---- Services (implemented in Infrastructure/ or by another use case) ----

// SecurityService: tokens, hashing, encryption, passwords.
type SecurityService interface {
	NewToken(prefix string) (token string, hash []byte, err error)
	HashToken(token string) []byte
	NewResumeCode() (display string, normalized string, err error)
	NormalizeCode(code string) string
	HashCode(normalized string) []byte
	NewVerificationCode() (code string, hash []byte, err error)
	HashPassword(password string) (string, error)
	CheckPassword(hash, password string) bool

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

// TTSCacheRepositoryI keeps read-aloud audio in the database: shared by every API instance and
// kept across restarts and redeploys, so a text-to-speech provider is paid once per clip.
type TTSCacheRepositoryI interface {
	// GetAudio returns the clip's audio and counts the hit; ErrNotFound when it isn't stored.
	GetAudio(ctx context.Context, key string) ([]byte, error)
	// PutAudio stores a clip (a clip already stored under the same key is kept).
	PutAudio(ctx context.Context, clip *TTSClip) error
}

type SpeechService interface {
	HasServerSpeech() bool
	HasCloudSpeech() bool
	Transcribe(ctx context.Context, audio []byte, language string, cloudConsent bool) (*Transcription, error)
	// Synthesize turns text into speech (MP3) with a cloud voice. ErrSpeechUnavailable if none.
	Synthesize(ctx context.Context, text, language string) ([]byte, error)
}
type MessageService interface {
	// SendMessage hands a message to the SMS provider. A real provider sends in the background
	// and records the result on msg.OutboxID, so the caller never waits for the network.
	SendMessage(ctx context.Context, msg *Message) error
}

// OutboxStatusI records what the provider said about an outbox message ("sent" or "failed").
type OutboxStatusI interface {
	MarkOutboxMessage(ctx context.Context, id uuid.UUID, status, provider string, errText *string) error
}
