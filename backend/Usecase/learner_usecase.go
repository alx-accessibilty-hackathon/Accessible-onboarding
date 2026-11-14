package usecase

import domain "bridge/Domain"

// LearnerUsecase: learners for the partner API (Level 2). Later also /me (Should).
type LearnerUsecase struct {
	LearnerRepo domain.LearnerRepositoryI
}

func NewLearnerUsecase(lrp domain.LearnerRepositoryI) *LearnerUsecase {
	return &LearnerUsecase{
		LearnerRepo: lrp,
	}
}
