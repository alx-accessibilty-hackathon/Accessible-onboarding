package usecase

import domain "bridge/Domain"

// JobUsecase: public job list and detail, JobPosting JSON-LD, employer create/list/publish.
type JobUsecase struct {
	JobRepo domain.JobRepositoryI
}

func NewJobUsecase(jrp domain.JobRepositoryI) *JobUsecase {
	return &JobUsecase{
		JobRepo: jrp,
	}
}
