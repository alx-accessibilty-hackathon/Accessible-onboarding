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
	SMS              SMSFlagsDTO     `json:"sms"`
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

// What the widget may offer by SMS (real SMS on).
type SMSFlagsDTO struct {
	VerifyPhone bool `json:"verify_phone"` // the optional phone check on the profile page
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

func toConfigDTO(c *domain.ClientConfig) ConfigDTO {
	referrals := make([]PartnerRefDTO, 0, len(c.ReferralPartners))
	for _, rp := range c.ReferralPartners {
		referrals = append(referrals, PartnerRefDTO{
			ID:   rp.ID,
			Name: rp.Name,
		})
	}

	languages := c.Languages
	if languages == nil {
		languages = []string{}
	}

	idRoutes := c.IDRoutes
	if idRoutes == nil {
		idRoutes = []string{}
	}

	return ConfigDTO{
		Partner: PartnerRefDTO{
			ID:   c.Partner.ID,
			Name: c.Partner.Name,
		},
		Languages:        languages,
		DefaultLanguage:  c.DefaultLanguage,
		IDRoutes:         idRoutes,
		ReferralPartners: referrals,
		Help: HelpDTO{
			Phone:    c.Help.Phone,
			Telegram: c.Help.Telegram,
		},
		Theme: ThemeDTO{
			Primary: c.Theme.Primary,
		},
		Speech: SpeechFlagsDTO{
			Server:         c.Speech.Server,
			CloudAvailable: c.Speech.CloudAvailable,
		},
		SMS: SMSFlagsDTO{VerifyPhone: c.SMS.VerifyPhone},
	}
}
