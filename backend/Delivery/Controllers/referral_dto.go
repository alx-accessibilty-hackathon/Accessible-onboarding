package controllers

import (
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// PATCH /partner/referrals/:id
type UpdateReferralRequest struct {
	Status string `json:"status" binding:"required,oneof=in_progress closed"`
}

// One item of GET /partner/referrals, and the 200 of PATCH /partner/referrals/:id.
type PartnerReferralDTO struct {
	ID                uuid.UUID          `json:"id"`
	Status            string             `json:"status"`             // requested | in_progress | closed
	ContactPreference string             `json:"contact_preference"` // phone | telegram | in_person
	CreatedAt         time.Time          `json:"created_at"`
	Learner           ReferralLearnerDTO `json:"learner"`
}

// The learner as the referral organisation sees them: never ID details or support needs.
type ReferralLearnerDTO struct {
	LearnerID     uuid.UUID `json:"learner_id"`
	FullName      string    `json:"full_name"`
	PreferredName string    `json:"preferred_name"`
	ContactMethod string    `json:"contact_method"`
	Phone         string    `json:"phone"`
	Language      string    `json:"language"`
}

func toPartnerReferralDTO(r *domain.PartnerReferral) PartnerReferralDTO {
	return PartnerReferralDTO{
		ID:                r.Referral.ID,
		Status:            r.Referral.Status,
		ContactPreference: r.Referral.ContactPreference,
		CreatedAt:         r.Referral.CreatedAt,
		Learner: ReferralLearnerDTO{
			LearnerID:     r.Learner.ID,
			FullName:      r.Learner.FullName,
			PreferredName: r.Learner.PreferredName,
			ContactMethod: r.Learner.ContactMethod,
			Phone:         r.Learner.PhoneE164,
			Language:      r.Learner.Language,
		},
	}
}

func toPartnerReferralDTOs(rs []*domain.PartnerReferral) []PartnerReferralDTO {
	out := make([]PartnerReferralDTO, 0, len(rs)) // [] in JSON, never null
	for _, r := range rs {
		out = append(out, toPartnerReferralDTO(r))
	}
	return out
}
