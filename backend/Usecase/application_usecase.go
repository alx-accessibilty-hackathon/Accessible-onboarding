package usecase

import domain "bridge/Domain"

// ApplicationUsecase submits job applications (optionally with the support request attached).
type ApplicationUsecase struct {
	ApplicationRepo domain.ApplicationRepositoryI
	JobRepo         domain.JobRepositoryI
}

func NewApplicationUsecase(arp domain.ApplicationRepositoryI, jrp domain.JobRepositoryI) *ApplicationUsecase {
	return &ApplicationUsecase{
		ApplicationRepo: arp,
		JobRepo:         jrp,
	}
}
