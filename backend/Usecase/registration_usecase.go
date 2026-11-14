package usecase

import domain "bridge/Domain"

// RegistrationUsecase: start a registration (issues a learner token), get it,
// save progress, save answers (version check), and submit.
type RegistrationUsecase struct {
	LearnerRepo      domain.LearnerRepositoryI
	RegistrationRepo domain.RegistrationRepositoryI
	SessionRepo      domain.SessionRepositoryI
	Security         domain.SecurityService
}

func NewRegistrationUsecase(lrp domain.LearnerRepositoryI, rrp domain.RegistrationRepositoryI, srp domain.SessionRepositoryI, sec domain.SecurityService) *RegistrationUsecase {
	return &RegistrationUsecase{
		LearnerRepo:      lrp,
		RegistrationRepo: rrp,
		SessionRepo:      srp,
		Security:         sec,
	}
}
