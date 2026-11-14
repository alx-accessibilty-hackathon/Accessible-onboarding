package usecase

import domain "bridge/Domain"

// SupportUsecase saves a learner's support request (needs), encrypted.
type SupportUsecase struct {
	SupportRepo domain.SupportRepositoryI
	Security    domain.SecurityService
}

func NewSupportUsecase(srp domain.SupportRepositoryI, sec domain.SecurityService) *SupportUsecase {
	return &SupportUsecase{
		SupportRepo: srp,
		Security:    sec,
	}
}
