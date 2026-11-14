package usecase

import domain "bridge/Domain"

// ConsentUsecase records consents (data use, cloud speech, SMS, partner access).
type ConsentUsecase struct {
	ConsentRepo domain.ConsentRepositoryI
}

func NewConsentUsecase(crp domain.ConsentRepositoryI) *ConsentUsecase {
	return &ConsentUsecase{
		ConsentRepo: crp,
	}
}
