package controllers

import (
	"time"

	domain "bridge/Domain"
)

// PUT /registrations/:id/support-request
type SaveSupportRequestRequest struct {
	Needs     []string     `json:"needs" binding:"max=20,dive,required,max=64"` // codes from shared/vocab/needs.json
	OtherText string       `json:"other_text" binding:"max=500"`
	ShareWith ShareWithDTO `json:"share_with"`
}

type ShareWithDTO struct {
	Courses   bool `json:"courses"`
	Employers bool `json:"employers"`
}

// 200 from PUT /registrations/:id/support-request. Never echoes the needs back.
type SupportSavedResponse struct {
	Status    string    `json:"status"` // "saved"
	UpdatedAt time.Time `json:"updated_at"`
}

// toDomain builds the domain object; the use case fills in LearnerID from the actor.
func (r SaveSupportRequestRequest) toDomain() *domain.SupportRequest {
	return &domain.SupportRequest{
		Needs:          r.Needs,
		OtherText:      r.OtherText,
		ShareCourses:   r.ShareWith.Courses,
		ShareEmployers: r.ShareWith.Employers,
	}
}
