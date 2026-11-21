package controllers

import (
	"encoding/json"
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// ---- Requests ----

// POST /registrations
type CreateRegistrationRequest struct {
	FlowID      string `json:"flow_id" binding:"required,max=64"`       // e.g. "signup"
	FlowVersion int    `json:"flow_version" binding:"omitempty,gte=1"`  // defaults to the latest
	Language    string `json:"language" binding:"required,min=2,max=8"` // "am", "en"…; the use case checks it is a language code
	SimpleMode  bool   `json:"simple_mode"`
}

// PATCH /registrations/:id  (every field optional: only what is sent changes)
type UpdateProgressRequest struct {
	CurrentStep *string `json:"current_step" binding:"omitempty,max=64"`
	Language    *string `json:"language" binding:"omitempty,min=2,max=8"`
	SimpleMode  *bool   `json:"simple_mode"`
}

// PUT /registrations/:id/answers/:questionId
type SaveAnswerRequest struct {
	Value       json.RawMessage `json:"value" binding:"required"`
	InputMethod string          `json:"input_method" binding:"required,oneof=typed voice choice partner"`
	BaseVersion int             `json:"base_version" binding:"gte=0"` // 0 = nothing saved yet
}

// ---- Responses ----

// 201 from POST /registrations
type CreateRegistrationResponse struct {
	RegistrationID uuid.UUID  `json:"registration_id"`
	LearnerID      uuid.UUID  `json:"learner_id"`
	Status         string     `json:"status"`
	CurrentStep    string     `json:"current_step"`
	Session        SessionDTO `json:"session"`
}

type AnswerDTO struct {
	QuestionID  string          `json:"question_id"`
	Value       json.RawMessage `json:"value"`
	InputMethod string          `json:"input_method"`
	Version     int             `json:"version"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// 200 from GET /registrations/:id. Support needs are never returned, only whether they were sent.
type RegistrationDTO struct {
	RegistrationID uuid.UUID            `json:"registration_id"`
	Status         string               `json:"status"`
	CurrentStep    string               `json:"current_step"`
	Language       string               `json:"language"`
	SimpleMode     bool                 `json:"simple_mode"`
	Answers        map[string]AnswerDTO `json:"answers"`
	SupportRequest SupportStatusDTO     `json:"support_request"`
	UpdatedAt      time.Time            `json:"updated_at"`
}

type SupportStatusDTO struct {
	Submitted bool `json:"submitted"`
}

// 409 from PUT …/answers/:questionId: another device saved a newer version.
type AnswerConflictResponse struct {
	ErrorResponse
	Current AnswerDTO `json:"current"`
}

// 200 from POST /registrations/:id/submit
type SubmitRegistrationResponse struct {
	Status        string       `json:"status"`
	LearnerID     uuid.UUID    `json:"learner_id"`
	IdentityLevel string       `json:"identity_level"`
	Referral      *ReferralDTO `json:"referral,omitempty"`
}

type ReferralDTO struct {
	ID          uuid.UUID `json:"id"`
	PartnerName string    `json:"partner_name"`
	Status      string    `json:"status"`
}

// ---- Mapping helpers (domain → DTO) ----

func toCreateRegistrationResponse(reg *domain.Registration, token string, expiresAt time.Time) CreateRegistrationResponse {
	return CreateRegistrationResponse{
		RegistrationID: reg.ID,
		LearnerID:      reg.LearnerID,
		Status:         reg.Status,
		CurrentStep:    reg.CurrentStep,
		Session:        SessionDTO{Token: token, ExpiresAt: expiresAt.UTC().Format(time.RFC3339)},
	}
}

func toAnswerDTO(a *domain.Answer) AnswerDTO {
	return AnswerDTO{
		QuestionID:  a.QuestionID,
		Value:       a.Value,
		InputMethod: a.InputMethod,
		Version:     a.Version,
		UpdatedAt:   a.UpdatedAt,
	}
}

func toSubmitRegistrationResponse(res *domain.SubmitResult) SubmitRegistrationResponse {
	return SubmitRegistrationResponse{
		Status:        res.Learner.Status,
		LearnerID:     res.Learner.ID,
		IdentityLevel: res.Learner.IdentityLevel,
		Referral:      toReferralDTO(res.Referral, res.ReferralPartnerName),
	}
}

func toAnswerDTOMap(answers []*domain.Answer) map[string]AnswerDTO {
	m := make(map[string]AnswerDTO, len(answers))
	for _, a := range answers {
		m[a.QuestionID] = toAnswerDTO(a)
	}
	return m
}

func toRegistrationDTO(reg *domain.Registration, learner *domain.Learner, answers []*domain.Answer, supportSubmitted bool) RegistrationDTO {
	return RegistrationDTO{
		RegistrationID: reg.ID,
		Status:         reg.Status,
		CurrentStep:    reg.CurrentStep,
		Language:       learner.Language,
		SimpleMode:     learner.SimpleMode,
		Answers:        toAnswerDTOMap(answers),
		SupportRequest: SupportStatusDTO{Submitted: supportSubmitted},
		UpdatedAt:      reg.UpdatedAt,
	}
}

func toReferralDTO(ref *domain.Referral, partnerName string) *ReferralDTO {
	if ref == nil {
		return nil
	}
	return &ReferralDTO{ID: ref.ID, PartnerName: partnerName, Status: ref.Status}
}

// ---- Cross-device resume & messaging DTOs ----

// POST /resume/lookup
type ResumeLookupRequest struct {
	Code  string `json:"code"`
	Token string `json:"token"`
}

type ResumeLookupResponse struct {
	RegistrationID uuid.UUID `json:"registration_id"`
	Check          string    `json:"check"` // "dob" | "phone" | "none" (sign-in code only)
	Kind           string    `json:"kind"`  // "resume" (an unfinished sign-up) | "sign_in" (a finished profile)
}

// resumeKind: "sign_in" for a sign-in code (a finished profile), else "resume".
func resumeKind(signIn bool) string {
	if signIn {
		return "sign_in"
	}
	return "resume"
}

// POST /resume/verify
type ResumeVerifyRequest struct {
	Code       string     `json:"code"`
	Token      string     `json:"token"`
	DOB        *ResumeDOB `json:"dob"`
	PhoneLast4 string     `json:"phone_last4" binding:"omitempty,len=4,numeric"`
}

type ResumeDOB struct {
	Calendar string `json:"calendar"`
	Year     int    `json:"year"`
	Month    int    `json:"month"`
	Day      int    `json:"day"`
}

type ResumeVerifyResponse struct {
	RegistrationID uuid.UUID  `json:"registration_id"`
	Kind           string     `json:"kind"` // "sign_in": open the profile, not the sign-up
	Session        SessionDTO `json:"session"`
}

// POST /partner/registrations/:id/consent-code
// POST /registrations/:id/resume-links (body optional)
type CreateResumeLinkRequest struct {
	SendVia string `json:"send_via" binding:"omitempty,oneof=none sms"`
	Phone   string `json:"phone" binding:"omitempty,max=32"` // defaults to the learner's phone
}

// 201 from POST /registrations/:id/resume-links
type ResumeLinkResponse struct {
	URL       string              `json:"url"`
	Code      string              `json:"code"`
	ExpiresAt string              `json:"expires_at"`
	Message   *ResumeLinkMessages `json:"message,omitempty"`
}

type ResumeLinkMessages struct {
	Channel string `json:"channel"`
	Status  string `json:"status"`
}

func toResumeLinkResponse(l *domain.ResumeLink) ResumeLinkResponse {
	r := ResumeLinkResponse{URL: l.URL, Code: l.Code, ExpiresAt: l.ExpiresAt.UTC().Format(time.RFC3339)}
	if l.Channel != "" {
		r.Message = &ResumeLinkMessages{Channel: l.Channel, Status: l.Status}
	}
	return r
}

type SendConsentCodeResponse struct {
	Status    string `json:"status"`
	Phone     string `json:"phone"`
	ExpiresIn int    `json:"expires_in"`
}

// POST /telegram/webhook
type TelegramWebhookResponse struct {
	OK bool `json:"ok"`
}
