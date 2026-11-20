package domain

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Errors shared by every layer. Repositories return these instead of database errors,
// and controllers turn them into HTTP status codes (respondError in Delivery/Controllers).
var (
	ErrNotFound          = errors.New("not found")                  // 404 not_found
	ErrUnauthorized      = errors.New("unauthorized")               // 401: no or bad credentials
	ErrForbidden         = errors.New("forbidden")                  // 403: signed in, but not allowed
	ErrConsentRequired   = errors.New("consent required")           // 403 consent_required
	ErrAlreadyExists     = errors.New("already exists")             // 409, e.g. applying to the same job twice
	ErrAlreadySubmitted  = errors.New("registration submitted")     // 409: a submitted registration can't change
	ErrRateLimited       = errors.New("rate limited")               // 429
	ErrSpeechUnavailable = errors.New("speech service unavailable") // 503: every speech provider failed
	ErrPayloadTooLarge   = errors.New("payload too large")          // 413
	ErrResumeExpired     = errors.New("resume token expired")
	ErrTooManyAttempts   = errors.New("too many failed attempts")
	ErrResumeCheckFailed = errors.New("resume check failed")
	ErrInvalidInput      = errors.New("invalid input")
	ErrNotRegistered     = errors.New("not registered")  // 409 not_registered: finish signing up first
	ErrSMSUnavailable    = errors.New("sms unavailable") // 503 sms_unavailable: real SMS is not set up
)

// FieldError is one problem with one field: Field is the JSON field or flow step ID,
// Code a shared error code ("required", "phone_invalid", …) the frontend translates.
type FieldError struct {
	Field string
	Code  string
}

// ValidationError means the input broke a rule (HTTP 422). It can hold several fields,
// for example every required answer that is missing on submit.
type ValidationError struct {
	Fields []FieldError
}

func NewValidationError(field, code string) *ValidationError {
	return &ValidationError{Fields: []FieldError{{Field: field, Code: code}}}
}

func (e *ValidationError) Error() string {
	parts := make([]string, 0, len(e.Fields))
	for _, f := range e.Fields {
		parts = append(parts, f.Field+": "+f.Code)
	}
	return "validation failed: " + strings.Join(parts, ", ")
}

// ConflictError means another device saved a newer version of an answer (HTTP 409, R15).
// Current is the saved answer, so the learner can choose which one to keep.
type ConflictError struct {
	Current *Answer
}

func (e *ConflictError) Error() string {
	return "answer changed on another device"
}

// Shared values. Keep them in sync with the CHECK constraints in the migrations.
const (
	PartnerKindPlatform    = "platform"
	PartnerKindReferralOrg = "referral_org"

	RolePartnerStaff = "partner_staff"
	RoleEmployer     = "employer"
	RoleSupport      = "support"
	RoleAdmin        = "admin"

	LearnerStatusDraft      = "draft"
	LearnerStatusRegistered = "registered"

	RegistrationStatusDraft     = "draft"
	RegistrationStatusSubmitted = "submitted"

	IdentitySelfDeclared    = "self_declared"
	IdentityPartnerAttested = "partner_attested"
	IdentityVerified        = "verified"

	JobStatusDraft     = "draft"
	JobStatusPublished = "published"

	JobSourceLocal = "local"

	LocationRemote = "remote"

	ApplicationStatusSubmitted = "submitted"

	ReferralStatusRequested  = "requested"
	ReferralStatusInProgress = "in_progress"
	ReferralStatusClosed     = "closed"
	ReferralStatusAttested   = "attested" // partner staff vouched for the learner (trusted referral)

	ContactPhone    = "phone"
	ContactTelegram = "telegram"
	ContactPartner  = "partner"
	ContactNone     = "none"

	// audit_log values (actor_type, action, target_type). Meta never holds personal data.
	AuditActorLearner         = "learner"
	AuditActorStaff           = "staff"
	AuditActionLearnerDeleted = "learner.deleted"
	AuditActionSupportRead    = "support_request.read"
	AuditActionVouchCodeMade  = "identity.vouch_code_made"  // partner staff made a code
	AuditActionVouched        = "identity.partner_attested" // the learner entered it
	AuditTargetLearner        = "learner"

	// IDRouteNone is the "I have no ID" answer: the learner is referred to a partner organisation (R7).
	IDRouteNone          = "none"
	IDRouteOtherDocument = "other_document"

	// NeedOther is the "something else" need. Employers can't offer it and it never matches a job.
	NeedOther = "other"
)

// ActorKind says who is calling the API.
type ActorKind string

const (
	ActorAnonymous     ActorKind = "anonymous"
	ActorLearner       ActorKind = "learner"
	ActorStaff         ActorKind = "staff"
	ActorPartnerServer ActorKind = "partner_server"
)

// Actor is the caller of a request. Middleware puts it in the request context;
// use cases use it for permission checks (Q7 in the requirements).
type Actor struct {
	Kind       ActorKind
	ID         uuid.UUID // learner, staff or partner id
	PartnerID  uuid.UUID // partner whose key or token was used
	Role       string    // staff role
	EmployerID *uuid.UUID
	Scopes     []string
	ActingFor  *uuid.UUID // learner a partner staff member is helping (E1)
}

// IsAnonymous is true when no learner, staff or partner-server token was sent.
func (a Actor) IsAnonymous() bool {
	return a.Kind == "" || a.Kind == ActorAnonymous
}

// ActsFor reports whether the actor may read and change this learner's own data (Q7):
// the learner themself, or partner staff who are helping them (E1).
func (a Actor) ActsFor(learnerID uuid.UUID) bool {
	switch a.Kind {
	case ActorLearner:
		return a.ID == learnerID
	case ActorStaff:
		return a.ActingFor != nil && *a.ActingFor == learnerID
	default:
		return false
	}
}

type Partner struct {
	ID             uuid.UUID
	Slug           string
	Name           string
	Kind           string
	PublishableKey string
	AllowedOrigins []string
	ClientID       string
	Config         map[string]any // languages, help contact, theme, id routes
	CreatedAt      time.Time
}

// ClientConfig holds the resolved settings the onboarding widget needs for a partner.
type ClientConfig struct {
	Partner          PartnerRef
	Languages        []string
	DefaultLanguage  string
	IDRoutes         []string
	ReferralPartners []PartnerRef
	Help             HelpConfig
	Theme            ThemeConfig
	Speech           SpeechFlags
	SMS              SMSFlags
}

type PartnerRef struct {
	ID   uuid.UUID
	Name string
}

type HelpConfig struct {
	Phone    string
	Telegram string
}

type ThemeConfig struct {
	Primary string
}

type SpeechFlags struct {
	Server         bool
	CloudAvailable bool
}

// SMSFlags: what the widget may offer by SMS (real SMS on: SMS_PROVIDER=smsethiopia).
type SMSFlags struct {
	VerifyPhone bool // the optional phone check on the profile page
}

// PhoneCodeSent: the phone-check code was sent (to the masked number, valid until ExpiresAt).
type PhoneCodeSent struct {
	SentTo    string
	ExpiresAt time.Time
}

type Employer struct {
	ID        uuid.UUID
	Name      string
	CreatedAt time.Time
}

type StaffUser struct {
	ID               uuid.UUID
	Email            string
	PasswordHash     string
	DisplayName      string
	Role             string
	PartnerID        *uuid.UUID
	EmployerID       *uuid.UUID
	DailyAttestLimit int
	CreatedAt        time.Time
}

type Learner struct {
	ID            uuid.UUID
	PartnerID     uuid.UUID
	Status        string
	FullName      string
	PreferredName string
	ContactMethod string
	PhoneE164     string
	PhoneVerified bool
	DOB           *time.Time
	DOBCalendar   string
	Language      string
	SimpleMode    bool
	IdentityLevel string
	CreatedAt     time.Time
	UpdatedAt     time.Time
	RegisteredAt  *time.Time
}

type Registration struct {
	ID            uuid.UUID
	LearnerID     uuid.UUID
	FlowID        string // flow file id, e.g. "signup" (not a UUID)
	FlowVersion   int
	Status        string
	CurrentStep   string
	ActingStaffID *uuid.UUID
	CreatedAt     time.Time
	UpdatedAt     time.Time
	SubmittedAt   *time.Time
}

type Answer struct {
	RegistrationID uuid.UUID
	QuestionID     string // step id from the flow file, e.g. "phone" (not a UUID)
	Value          json.RawMessage
	InputMethod    string // typed | voice | choice | partner
	Version        int
	UpdatedAt      time.Time
}

// RegistrationView is what GET /registrations/:id shows: the registration, the learner's
// display preferences and every saved answer. Support needs are never included, only
// whether they were sent.
type RegistrationView struct {
	Registration     *Registration
	Learner          *Learner
	Answers          []*Answer
	SupportSubmitted bool
}

// SubmitResult is the outcome of POST /registrations/:id/submit.
type SubmitResult struct {
	Learner             *Learner
	Evidence            *IdentityEvidence // nil when an already-submitted registration is submitted again
	Referral            *Referral         // set only when the learner has no ID and asked to be referred
	ReferralPartnerName string
}

type IdentityEvidence struct {
	ID         uuid.UUID
	LearnerID  uuid.UUID
	Route      string // fayda | kebele_id | refugee_id | unhcr_proof | other_document | none
	DocType    string
	Last4      string
	Level      string
	AttestedBy *uuid.UUID
	AttestedAt *time.Time
	CreatedAt  time.Time
}

type Referral struct {
	ID                uuid.UUID
	LearnerID         uuid.UUID
	PartnerID         uuid.UUID
	ContactPreference string
	Status            string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// SupportRequest is plain here; it is encrypted before it is stored.
type SupportRequest struct {
	ID             uuid.UUID
	LearnerID      uuid.UUID
	Needs          []string
	OtherText      string
	ShareCourses   bool
	ShareEmployers bool
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// SealedSupportRequest is a support request as stored: the needs and free text are AES-GCM
// ciphertext (decrypt with the learner ID as additional data); the share flags are plain.
type SealedSupportRequest struct {
	LearnerID      uuid.UUID
	Nonce          []byte
	Ciphertext     []byte
	ShareCourses   bool
	ShareEmployers bool
	UpdatedAt      time.Time
}

// LearnerProfile is what GET /me shows the learner: their own data (Q4).
type LearnerProfile struct {
	Learner             *Learner
	Registration        *Registration     // the latest; nil if none
	Identity            *IdentityEvidence // the latest; nil before submit
	Support             *SupportRequest   // decrypted, only for the learner themself; nil if none
	Referral            *Referral         // the latest; nil if none
	ReferralPartnerName string
}

// LearnerExport is the complete export of personal data for GET /me/export (Q4).
type LearnerExport struct {
	ExportedAt time.Time
	Profile    *LearnerProfile
	Answers    []*Answer
	Consents   []*Consent
}

// ProfileChanges is PATCH /me: nil means "keep". DOB holds the raw date answer (same shape as
// the sign-up "dob" answer); JSON null clears it.
type ProfileChanges struct {
	FullName      *string
	PreferredName *string
	ContactMethod *string
	Phone         *string
	DOB           json.RawMessage
	Language      *string
	SimpleMode    *bool
}

// PartnerReferral is a referral with the learner it is about, as the referral partner's
// staff see it (R7). Only the learner's name, contact and language are filled in.
type PartnerReferral struct {
	Referral *Referral
	Learner  *Learner
}

// EmployerApplication is an application as the employer of the job sees it (C3).
// Sealed is set by the repository only when the applicant attached their support request;
// the use case decrypts it into Support.
type EmployerApplication struct {
	Application *Application
	Applicant   *Learner // name, contact and language only
	Sealed      *SealedSupportRequest
	Support     *SupportRequest
}

// VouchCode is a one-time code partner staff make to vouch for a learner (trusted referral).
type VouchCode struct {
	ID             uuid.UUID
	ReferralID     uuid.UUID
	LearnerID      uuid.UUID
	PartnerID      uuid.UUID
	StaffID        uuid.UUID
	CodeHash       []byte
	FailedAttempts int
	ExpiresAt      time.Time
}

// VouchCodeIssued is what the staff member sees: the code to tell the learner.
type VouchCodeIssued struct {
	Code        string
	ExpiresAt   time.Time
	LearnerName string
}

// Vouched is the result of the learner entering the code.
type Vouched struct {
	IdentityLevel string
	PartnerName   string
}

// AuditEntry is one row of audit_log. Meta never holds personal data.
type AuditEntry struct {
	ActorType  string
	ActorID    *uuid.UUID
	Action     string
	TargetType string
	TargetID   *uuid.UUID
	Meta       map[string]any
}

type Consent struct {
	ID        uuid.UUID
	LearnerID uuid.UUID
	Kind      string // data_processing | cloud_speech | sms | telegram | partner_access
	Granted   bool
	Method    string // tap | sms_code | spoken | partner_witnessed
	PartnerID *uuid.UUID
	StaffID   *uuid.UUID
	CreatedAt time.Time
	RevokedAt *time.Time
}

// AuthSession stores only the hash of a token, never the token itself.
type AuthSession struct {
	ID          uuid.UUID
	SubjectType string    // learner | staff | partner_server
	SubjectID   uuid.UUID // learner, staff or partner id
	TokenHash   []byte
	Scopes      []string
	ActingFor   *uuid.UUID
	ExpiresAt   time.Time
	RevokedAt   *time.Time
}

type Job struct {
	ID             uuid.UUID
	EmployerID     *uuid.UUID // nil for imported jobs
	Source         string     // local | imported
	Title          string
	Description    string
	LocationType   string // onsite | remote | hybrid
	LocationText   string
	WorkHours      string
	EmploymentType string
	Accommodations []string // codes from shared/vocab/needs.json
	Status         string
	CreatedAt      time.Time
	PublishedAt    *time.Time
	EmployerName   string // filled by the queries that join the employers table
}

// JobCursor marks the last job of a page in the public job list (newest first).
type JobCursor struct {
	PublishedAt time.Time
	ID          uuid.UUID
}

type Application struct {
	ID            uuid.UUID
	JobID         uuid.UUID
	LearnerID     uuid.UUID
	Answers       json.RawMessage
	AttachSupport bool
	Status        string
	CreatedAt     time.Time
}

// LearnerApplication is one of the learner's own applications, for the support passport
// (GET /me/applications): which employer, and whether it may see their support needs.
type LearnerApplication struct {
	ID           uuid.UUID
	JobID        uuid.UUID
	JobTitle     string
	EmployerName string
	Status       string
	ShareSupport bool // applications.attach_support
	CreatedAt    time.Time
}

// Transcription is what a speech-to-text provider returns.
type Transcription struct {
	Text       string
	Confidence float64 // 0..1, or -1 when the provider gives none
	Provider   string
}

// TTSClip is read-aloud audio of fixed interface text, kept so the provider is paid only once.
type TTSClip struct {
	Key      string // provider|voice|language|sha256(text)
	Provider string // addis, azure
	Voice    string // e.g. am-hamen
	Language string // am, en
	Text     string // fixed interface text (never a learner's own words)
	MimeType string // audio/mpeg
	Audio    []byte
}

// Message is an SMS or Telegram message to send.
type Message struct {
	Channel   string // sms | telegram
	Recipient string
	Body      string
	OutboxID  uuid.UUID // its messages_outbox row (uuid.Nil if none): the sender records the result there
}

// ResumeToken represents a temporary resume link or code for cross-device sign-up.
type ResumeToken struct {
	ID             uuid.UUID
	RegistrationID uuid.UUID
	TokenHash      []byte
	CodeHash       []byte
	FailedAttempts int
	ExpiresAt      time.Time
	UsedAt         *time.Time
	CreatedAt      time.Time
}

// VerificationCode represents a one-time code (e.g. 6 digits) for consent or phone sign-in.
type VerificationCode struct {
	ID             uuid.UUID
	PhoneE164      string
	Purpose        string // login | consent | verify_phone
	CodeHash       []byte
	LearnerID      *uuid.UUID
	FailedAttempts int
	ExpiresAt      time.Time
	UsedAt         *time.Time
	CreatedAt      time.Time
}

// OutboxMessage represents a queued message for SMS or Telegram delivery.
type OutboxMessage struct {
	ID        uuid.UUID
	Channel   string // sms | telegram
	Recipient string
	Body      string
	Status    string // queued | sent | failed
	Provider  *string
	Error     *string
	CreatedAt time.Time
	SentAt    *time.Time
}

// ResumeDOB carries date of birth fields for resume verification.
type ResumeDOB struct {
	Calendar string
	Year     int
	Month    int
	Day      int
}

// ResumeLink is what "Continue on another device" gives the learner (R15).
type ResumeLink struct {
	URL       string // PUBLIC_WEB_URL + "/r/" + token
	Code      string // "K7M-9P2"
	ExpiresAt time.Time
	Channel   string // sms | telegram | "" (not sent)
	Status    string // queued | "" (not sent)
}

type ResumeLookupResult struct {
	RegistrationID uuid.UUID
	Check          string // "dob" | "phone"
}

type ResumeVerifyResult struct {
	RegistrationID uuid.UUID
	SessionToken   string
	ExpiresAt      time.Time
}

type TelegramUpdate struct {
	UpdateID int              `json:"update_id"`
	Message  *TelegramMessage `json:"message"`
}

type TelegramMessage struct {
	MessageID int           `json:"message_id"`
	From      *TelegramUser `json:"from"`
	Chat      TelegramChat  `json:"chat"`
	Date      int64         `json:"date"`
	Text      string        `json:"text"`
}

type TelegramUser struct {
	ID        int64  `json:"id"`
	FirstName string `json:"first_name"`
	Username  string `json:"username"`
}

type TelegramChat struct {
	ID   int64  `json:"id"`
	Type string `json:"type"`
}
