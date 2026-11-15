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
