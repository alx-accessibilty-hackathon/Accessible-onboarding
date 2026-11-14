package usecase

import domain "bridge/Domain"

// AuthUsecase: logout, staff login and "who am I", OAuth client credentials for partner servers.
type AuthUsecase struct {
	SessionRepo domain.SessionRepositoryI
	StaffRepo   domain.StaffRepositoryI
	PartnerRepo domain.PartnerRepositoryI
	Security    domain.SecurityService
}

func NewAuthUsecase(srp domain.SessionRepositoryI, strp domain.StaffRepositoryI, prp domain.PartnerRepositoryI, sec domain.SecurityService) *AuthUsecase {
	return &AuthUsecase{
		SessionRepo: srp,
		StaffRepo:   strp,
		PartnerRepo: prp,
		Security:    sec,
	}
}
