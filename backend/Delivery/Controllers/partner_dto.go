package controllers

import (
	domain "bridge/Domain"

	"github.com/google/uuid"
)

// Body of POST /partners (self-service partner sign-up). The server makes the key.
type CreatePartnerRequest struct {
	Name            string                 `json:"name" binding:"required,max=200"`
	Slug            string                 `json:"slug" binding:"required,max=100"`
	Kind            string                 `json:"kind" binding:"omitempty,oneof=platform referral_org"`
	AllowedOrigins  []string               `json:"allowed_origins" binding:"required,min=1,max=50,dive,max=300"`
	Languages       []string               `json:"languages" binding:"omitempty,max=20,dive,max=10"`
	DefaultLanguage string                 `json:"default_language" binding:"omitempty,max=10"`
	Help            *CreatePartnerHelpDTO  `json:"help"`
	Theme           *CreatePartnerThemeDTO `json:"theme"`
}

type CreatePartnerHelpDTO struct {
	Phone    string `json:"phone" binding:"omitempty,max=40"`
	Telegram string `json:"telegram" binding:"omitempty,max=40"`
}

type CreatePartnerThemeDTO struct {
	Primary string `json:"primary" binding:"omitempty,max=20"`
}

func (r CreatePartnerRequest) toDomain() domain.PartnerSignup {
	in := domain.PartnerSignup{
		Name: r.Name, Slug: r.Slug, Kind: r.Kind, AllowedOrigins: r.AllowedOrigins,
		Languages: r.Languages, DefaultLanguage: r.DefaultLanguage,
	}
	if r.Help != nil {
		in.HelpPhone, in.HelpTelegram = r.Help.Phone, r.Help.Telegram
	}
	if r.Theme != nil {
		in.ThemePrimary = r.Theme.Primary
	}
	return in
}

// 201 from POST /partners. client_secret is shown only in this answer.
type CreatedPartnerDTO struct {
	Partner        CreatedPartnerInfoDTO `json:"partner"`
	PublishableKey string                `json:"publishable_key"`
	ClientID       string                `json:"client_id"`
	ClientSecret   string                `json:"client_secret"`
	Scope          string                `json:"scope"`
}

type CreatedPartnerInfoDTO struct {
	ID             uuid.UUID      `json:"id"`
	Slug           string         `json:"slug"`
	Name           string         `json:"name"`
	Kind           string         `json:"kind"`
	AllowedOrigins []string       `json:"allowed_origins"`
	Config         map[string]any `json:"config"` // languages, default_language, help, theme
}

func toCreatedPartnerDTO(c *domain.CreatedPartner) CreatedPartnerDTO {
	p := c.Partner
	return CreatedPartnerDTO{
		Partner: CreatedPartnerInfoDTO{
			ID: p.ID, Slug: p.Slug, Name: p.Name, Kind: p.Kind, AllowedOrigins: p.AllowedOrigins, Config: p.Config,
		},
		PublishableKey: p.PublishableKey,
		ClientID:       p.ClientID,
		ClientSecret:   c.ClientSecret,
		Scope:          "learners:read",
	}
}
