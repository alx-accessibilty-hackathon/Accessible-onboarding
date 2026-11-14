package usecase

import (
	"context"
	"strings"

	domain "bridge/Domain"
)

var (
	defaultLanguages    = []string{"am", "en"}
	defaultDefaultLang  = "am"
	defaultIDRoutes     = []string{"fayda", "kebele_id", "refugee_id", "unhcr_proof", "other_document", "none"}
	defaultPrimaryColor = "#cc3636"
)

// ConfigUsecase returns a partner's widget settings (languages, ID routes, help contact, theme).
type ConfigUsecase struct {
	PartnerRepo domain.PartnerRepositoryI
	Speech      domain.SpeechService
}

// Compile-time check that ConfigUsecase implements ConfigUsecaseI.
var _ domain.ConfigUsecaseI = (*ConfigUsecase)(nil)

func NewConfigUsecase(prp domain.PartnerRepositoryI, speech ...domain.SpeechService) *ConfigUsecase {
	uc := &ConfigUsecase{
		PartnerRepo: prp,
	}
	if len(speech) > 0 {
		uc.Speech = speech[0]
	}
	return uc
}

func (uc *ConfigUsecase) GetConfig(ctx context.Context, partnerKey string) (*domain.ClientConfig, error) {
	if strings.TrimSpace(partnerKey) == "" {
		return nil, domain.ErrNotFound
	}

	partner, err := uc.PartnerRepo.GetByPublishableKey(ctx, partnerKey)
	if err != nil {
		return nil, err
	}

	referralPartners, err := uc.PartnerRepo.ListReferralPartners(ctx)
	if err != nil {
		return nil, err
	}

	refRefs := make([]domain.PartnerRef, 0, len(referralPartners))
	for _, rp := range referralPartners {
		refRefs = append(refRefs, domain.PartnerRef{
			ID:   rp.ID,
			Name: rp.Name,
		})
	}

	partnerConfig := partner.Config
	if partnerConfig == nil {
		partnerConfig = make(map[string]any)
	}

	languages := parseStringSlice(partnerConfig["languages"], defaultLanguages)
	defaultLang := parseString(partnerConfig["default_language"], defaultDefaultLang)
	// If the default language is not among the configured languages, choose the first language.
	if !containsString(languages, defaultLang) && len(languages) > 0 {
		defaultLang = languages[0]
	}

	idRoutes := parseStringSlice(partnerConfig["id_routes"], defaultIDRoutes)
	help := parseHelp(partnerConfig["help"])
	theme := parseTheme(partnerConfig["theme"], defaultPrimaryColor)
	speechFlags := uc.resolveSpeechFlags(partnerConfig)

	return &domain.ClientConfig{
		Partner: domain.PartnerRef{
			ID:   partner.ID,
			Name: partner.Name,
		},
		Languages:        languages,
		DefaultLanguage:  defaultLang,
		IDRoutes:         idRoutes,
		ReferralPartners: refRefs,
		Help:             help,
		Theme:            theme,
		Speech:           speechFlags,
	}, nil
}

func (uc *ConfigUsecase) resolveSpeechFlags(partnerConfig map[string]any) domain.SpeechFlags {
	serverSpeech := false
	cloudSpeech := false

	if uc.Speech != nil {
		serverSpeech = uc.Speech.HasServerSpeech()
		cloudSpeech = uc.Speech.HasCloudSpeech()
	}

	if val, ok := partnerConfig["speech"]; ok {
		if m, ok := val.(map[string]any); ok {
			if s, ok := m["server"].(bool); ok {
				serverSpeech = s
			}
			if c, ok := m["cloud_available"].(bool); ok {
				cloudSpeech = c
			}
		}
	}

	return domain.SpeechFlags{
		Server:         serverSpeech,
		CloudAvailable: cloudSpeech,
	}
}

func parseStringSlice(val any, defaultVal []string) []string {
	if val == nil {
		return defaultVal
	}
	switch v := val.(type) {
	case []string:
		if len(v) > 0 {
			return v
		}
	case []any:
		res := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
				res = append(res, strings.TrimSpace(s))
			}
		}
		if len(res) > 0 {
			return res
		}
	}
	return defaultVal
}

func parseString(val any, defaultVal string) string {
	if val == nil {
		return defaultVal
	}
	if s, ok := val.(string); ok && strings.TrimSpace(s) != "" {
		return strings.TrimSpace(s)
	}
	return defaultVal
}

func parseHelp(val any) domain.HelpConfig {
	var help domain.HelpConfig
	if m, ok := val.(map[string]any); ok {
		if phone, ok := m["phone"].(string); ok {
			help.Phone = strings.TrimSpace(phone)
		}
		if telegram, ok := m["telegram"].(string); ok {
			help.Telegram = strings.TrimSpace(telegram)
		}
	}
	return help
}

func parseTheme(val any, defaultPrimary string) domain.ThemeConfig {
	theme := domain.ThemeConfig{Primary: defaultPrimary}
	if m, ok := val.(map[string]any); ok {
		if primary, ok := m["primary"].(string); ok && strings.TrimSpace(primary) != "" {
			theme.Primary = strings.TrimSpace(primary)
		}
	}
	return theme
}

func containsString(slice []string, val string) bool {
	for _, s := range slice {
		if s == val {
			return true
		}
	}
	return false
}
