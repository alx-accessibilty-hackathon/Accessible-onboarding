package controllers

import (
	domain "bridge/Domain"

	"github.com/google/uuid"
)

// 200 from GET /config: what the widget needs to set itself up on a partner's site.
type ConfigDTO struct {
	Partner          PartnerRefDTO   `json:"partner"`
	Languages        []string        `json:"languages"`
	DefaultLanguage  string          `json:"default_language"`
	IDRoutes         []string        `json:"id_routes"`
	ReferralPartners []PartnerRefDTO `json:"referral_partners"`
	Help             HelpDTO         `json:"help"`
	Theme            ThemeDTO        `json:"theme"`
	Speech           SpeechFlagsDTO  `json:"speech"`
}

type PartnerRefDTO struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}

type HelpDTO struct {
	Phone    string `json:"phone,omitempty"`
	Telegram string `json:"telegram,omitempty"`
}

type ThemeDTO struct {
	Primary string `json:"primary,omitempty"`
}

type SpeechFlagsDTO struct {
	Server         bool `json:"server"`          // our API can turn audio into text
	CloudAvailable bool `json:"cloud_available"` // a cloud provider is configured (needs consent)
}

func toPartnerRefDTO(p *domain.Partner) PartnerRefDTO {
	return PartnerRefDTO{ID: p.ID, Name: p.Name}
}

func toPartnerRefDTOs(ps []*domain.Partner) []PartnerRefDTO {
	out := make([]PartnerRefDTO, 0, len(ps))
	for _, p := range ps {
		out = append(out, toPartnerRefDTO(p))
	}
	return out
}
