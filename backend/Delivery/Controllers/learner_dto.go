package controllers

import (
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// LearnerDTO is a learner as other platforms and the learner themselves see it
// (partner API, later GET /me). It never includes support needs or ID details.
type LearnerDTO struct {
	LearnerID     uuid.UUID  `json:"learner_id"`
	FullName      string     `json:"full_name"`
	PreferredName string     `json:"preferred_name"`
	Language      string     `json:"language"`
	Status        string     `json:"status"`
	IdentityLevel string     `json:"identity_level"`
	Contact       ContactDTO `json:"contact"`
	RegisteredAt  *time.Time `json:"registered_at"`
}

type ContactDTO struct {
	Method   string `json:"method"`          // phone | telegram | partner | none
	Phone    string `json:"phone,omitempty"` // E.164, e.g. +251912345678
	Verified bool   `json:"verified"`
}

// GET /partner-api/learners?updated_since=…&limit=…
type ListPartnerLearnersQuery struct {
	UpdatedSince *time.Time `form:"updated_since" time_format:"2006-01-02T15:04:05Z07:00"`
	Limit        int        `form:"limit" binding:"omitempty,min=1,max=200"`
	Cursor       string     `form:"cursor" binding:"omitempty,max=200"`
}

func toLearnerDTO(l *domain.Learner) LearnerDTO {
	return LearnerDTO{
		LearnerID:     l.ID,
		FullName:      l.FullName,
		PreferredName: l.PreferredName,
		Language:      l.Language,
		Status:        l.Status,
		IdentityLevel: l.IdentityLevel,
		Contact: ContactDTO{
			Method:   l.ContactMethod,
			Phone:    l.PhoneE164,
			Verified: l.PhoneVerified,
		},
		RegisteredAt: l.RegisteredAt,
	}
}

func toLearnerDTOs(ls []*domain.Learner) []LearnerDTO {
	out := make([]LearnerDTO, 0, len(ls))
	for _, l := range ls {
		out = append(out, toLearnerDTO(l))
	}
	return out
}
