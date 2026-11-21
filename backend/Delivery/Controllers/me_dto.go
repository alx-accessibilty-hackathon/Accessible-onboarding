package controllers

import (
	"encoding/json"
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// ---- Requests ----

// PATCH /me  (every field optional: only what is sent changes; "dob": null clears the date)
type UpdateMeRequest struct {
	FullName      *string         `json:"full_name"`
	PreferredName *string         `json:"preferred_name"`
	ContactMethod *string         `json:"contact_method"` // phone | telegram | partner | none
	Phone         *string         `json:"phone"`
	DOB           json.RawMessage `json:"dob"` // same value as the sign-up "dob" answer
	Language      *string         `json:"language" binding:"omitempty,min=2,max=8"`
	SimpleMode    *bool           `json:"simple_mode"`
}

// ---- Responses ----

// 200 from GET and PATCH /me: the learner's own data. Only here is the support request
// decrypted, because it is theirs.
type MeDTO struct {
	LearnerID      uuid.UUID      `json:"learner_id"`
	RegistrationID *uuid.UUID     `json:"registration_id"` // the latest registration
	Status         string         `json:"status"`          // draft | registered
	FullName       string         `json:"full_name"`
	PreferredName  string         `json:"preferred_name"`
	ContactMethod  string         `json:"contact_method"` // phone | telegram | partner | none | ""
	Phone          string         `json:"phone"`          // E.164 or ""
	PhoneVerified  bool           `json:"phone_verified"` // confirmed with an SMS code (profile page)
	DOB            *MeDOBDTO      `json:"dob"`
	Language       string         `json:"language"`
	SimpleMode     bool           `json:"simple_mode"`
	Identity       *MeIdentityDTO `json:"identity"`
	Support        *MeSupportDTO  `json:"support"`
	Referral       *MeReferralDTO `json:"referral"`
	RegisteredAt   *time.Time     `json:"registered_at"`
}

type MeDOBDTO struct {
	ISO      string `json:"iso"`      // "2017-09-25"
	Calendar string `json:"calendar"` // ethiopian | gregorian
}

type MeIdentityDTO struct {
	Route    string `json:"route"`
	DocType  string `json:"doc_type"`
	Level    string `json:"level"`
	HasLast4 bool   `json:"has_last4"` // the last 4 characters themselves are never shown
}

type MeSupportDTO struct {
	Needs     []string     `json:"needs"`
	OtherText string       `json:"other_text"`
	ShareWith ShareWithDTO `json:"share_with"`
}

type MeReferralDTO struct {
	PartnerName       string `json:"partner_name"`
	Status            string `json:"status"`
	ContactPreference string `json:"contact_preference"`
}

// ---- Mapping helpers ----

func (r UpdateMeRequest) toDomain() *domain.ProfileChanges {
	return &domain.ProfileChanges{
		FullName:      r.FullName,
		PreferredName: r.PreferredName,
		ContactMethod: r.ContactMethod,
		Phone:         r.Phone,
		DOB:           r.DOB,
		Language:      r.Language,
		SimpleMode:    r.SimpleMode,
	}
}

func toMeDTO(p *domain.LearnerProfile) MeDTO {
	l := p.Learner
	dto := MeDTO{
		LearnerID:     l.ID,
		Status:        l.Status,
		FullName:      l.FullName,
		PreferredName: l.PreferredName,
		ContactMethod: l.ContactMethod,
		Phone:         l.PhoneE164,
		PhoneVerified: l.PhoneVerified,
		Language:      l.Language,
		SimpleMode:    l.SimpleMode,
		RegisteredAt:  l.RegisteredAt,
	}
	if p.Registration != nil {
		id := p.Registration.ID
		dto.RegistrationID = &id
	}
	if l.DOB != nil {
		calendar := l.DOBCalendar
		if calendar == "" {
			calendar = "gregorian"
		}
		dto.DOB = &MeDOBDTO{ISO: l.DOB.Format("2006-01-02"), Calendar: calendar}
	}
	if ev := p.Identity; ev != nil {
		dto.Identity = &MeIdentityDTO{Route: ev.Route, DocType: ev.DocType, Level: ev.Level, HasLast4: ev.Last4 != ""}
	}
	if s := p.Support; s != nil {
		needs := s.Needs
		if needs == nil {
			needs = []string{}
		}
		dto.Support = &MeSupportDTO{
			Needs:     needs,
			OtherText: s.OtherText,
			ShareWith: ShareWithDTO{Courses: s.ShareCourses, Employers: s.ShareEmployers},
		}
	}
	if ref := p.Referral; ref != nil {
		dto.Referral = &MeReferralDTO{PartnerName: p.ReferralPartnerName, Status: ref.Status, ContactPreference: ref.ContactPreference}
	}
	return dto
}

// 200 from GET /me/export (Q4): the learner's complete data export.
type MeExportDTO struct {
	ExportedAt       time.Time          `json:"exported_at"`
	Learner          MeDTO              `json:"learner"`
	Registration     *ExportRegDTO      `json:"registration,omitempty"`
	Answers          []ExportAnswerDTO  `json:"answers,omitempty"`
	IdentityEvidence *MeIdentityDTO     `json:"identity_evidence,omitempty"`
	SupportRequest   *MeSupportDTO      `json:"support_request,omitempty"`
	Referral         *MeReferralDTO     `json:"referral,omitempty"`
	Consents         []ExportConsentDTO `json:"consents,omitempty"`
}

type ExportRegDTO struct {
	ID          uuid.UUID `json:"id"`
	FlowID      string    `json:"flow_id"`
	FlowVersion int       `json:"flow_version"`
	Status      string    `json:"status"`
	CurrentStep string    `json:"current_step"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type ExportAnswerDTO struct {
	QuestionID  string          `json:"question_id"`
	Value       json.RawMessage `json:"value"`
	InputMethod string          `json:"input_method"`
	Version     int             `json:"version"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

type ExportConsentDTO struct {
	Kind       string    `json:"kind"`
	Granted    bool      `json:"granted"`
	Method     string    `json:"method"`
	RecordedAt time.Time `json:"recorded_at"`
}

func toMeExportDTO(exp *domain.LearnerExport) MeExportDTO {
	meDTO := toMeDTO(exp.Profile)
	dto := MeExportDTO{
		ExportedAt:       exp.ExportedAt,
		Learner:          meDTO,
		IdentityEvidence: meDTO.Identity,
		SupportRequest:   meDTO.Support,
		Referral:         meDTO.Referral,
	}
	if exp.Profile.Registration != nil {
		reg := exp.Profile.Registration
		dto.Registration = &ExportRegDTO{
			ID:          reg.ID,
			FlowID:      reg.FlowID,
			FlowVersion: reg.FlowVersion,
			Status:      reg.Status,
			CurrentStep: reg.CurrentStep,
			CreatedAt:   reg.CreatedAt,
			UpdatedAt:   reg.UpdatedAt,
		}
	}
	if len(exp.Answers) > 0 {
		dto.Answers = make([]ExportAnswerDTO, 0, len(exp.Answers))
		for _, a := range exp.Answers {
			dto.Answers = append(dto.Answers, ExportAnswerDTO{
				QuestionID:  a.QuestionID,
				Value:       a.Value,
				InputMethod: a.InputMethod,
				Version:     a.Version,
				UpdatedAt:   a.UpdatedAt,
			})
		}
	}
	if len(exp.Consents) > 0 {
		dto.Consents = make([]ExportConsentDTO, 0, len(exp.Consents))
		for _, c := range exp.Consents {
			dto.Consents = append(dto.Consents, ExportConsentDTO{
				Kind:       c.Kind,
				Granted:    c.Granted,
				Method:     c.Method,
				RecordedAt: c.CreatedAt,
			})
		}
	}
	return dto
}

// POST /me/phone-verification/confirm
type ConfirmPhoneRequest struct {
	Code string `json:"code"`
}

// 202 from POST /me/phone-verification: the code was sent (to the masked number).
type PhoneCodeSentDTO struct {
	SentTo    string    `json:"sent_to"`    // masked, e.g. "+2519•••••678"
	ExpiresAt time.Time `json:"expires_at"` // 10 minutes
}

// 200 from GET and POST /me/sign-in-code: the code to sign in again on another phone.
type SignInCodeDTO struct {
	Code      string `json:"code"` // XXXX-XXXX
	CreatedAt string `json:"created_at"`
}

func toSignInCodeDTO(s *domain.SignInCodeShown) SignInCodeDTO {
	return SignInCodeDTO{Code: s.Code, CreatedAt: s.CreatedAt.UTC().Format(time.RFC3339)}
}
