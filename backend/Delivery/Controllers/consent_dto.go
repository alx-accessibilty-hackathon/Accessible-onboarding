package controllers

import (
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// POST /registrations/:id/consents
type CreateConsentRequest struct {
	Kind    string `json:"kind" binding:"required,oneof=data_processing cloud_speech sms telegram partner_access"`
	Granted *bool  `json:"granted" binding:"required"` // pointer: `false` is a valid answer, a missing field is not
	Method  string `json:"method" binding:"required,oneof=tap sms_code spoken partner_witnessed"`
}

// 201 from POST /registrations/:id/consents
type ConsentDTO struct {
	ID        uuid.UUID `json:"id"`
	Kind      string    `json:"kind"`
	Granted   bool      `json:"granted"`
	CreatedAt time.Time `json:"created_at"`
}

func (r CreateConsentRequest) toDomain() *domain.Consent {
	return &domain.Consent{Kind: r.Kind, Granted: *r.Granted, Method: r.Method}
}

func toConsentDTO(c *domain.Consent) ConsentDTO {
	return ConsentDTO{ID: c.ID, Kind: c.Kind, Granted: c.Granted, CreatedAt: c.CreatedAt}
}
