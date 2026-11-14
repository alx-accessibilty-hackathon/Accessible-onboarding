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
	ErrNotFound          = errors.New("not found")              // 404 not_found
	ErrUnauthorized      = errors.New("unauthorized")           // 401: no or bad credentials
	ErrForbidden         = errors.New("forbidden")              // 403: signed in, but not allowed
	ErrConsentRequired   = errors.New("consent required")       // 403 consent_required
	ErrAlreadyExists     = errors.New("already exists")         // 409, e.g. applying to the same job twice
	ErrAlreadySubmitted  = errors.New("registration submitted") // 409: a submitted registration can't change
	ErrRateLimited       = errors.New("rate limited")           // 429
	ErrSpeechUnavailable = errors.New("speech unavailable")     // 503: every speech provider failed
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

	ReferralStatusRequested = "requested"

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

// Transcription is what a speech-to-text provider returns.
type Transcription struct {
	Text       string
	Confidence float64 // 0..1, or -1 when the provider gives none
	Provider   string
}

// Message is an SMS or Telegram message to send.
type Message struct {
	Channel   string // sms | telegram
	Recipient string
	Body      string
}
