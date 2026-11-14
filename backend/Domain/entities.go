package domain

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

// Errors shared by every layer. Repositories return these instead of database errors,
// and controllers turn them into HTTP status codes.
var (
	ErrNotFound = errors.New("not found")
)

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
