package usecase

import domain "bridge/Domain"

// ConfigUsecase returns a partner's widget settings (languages, ID routes, help contact, theme).
type ConfigUsecase struct {
	PartnerRepo domain.PartnerRepositoryI
}

func NewConfigUsecase(prp domain.PartnerRepositoryI) *ConfigUsecase {
	return &ConfigUsecase{
		PartnerRepo: prp,
	}
}
