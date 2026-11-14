package usecase

import (
	"context"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// LearnerUsecase: learners for the partner API (Level 2). Later also /me (Should).
type LearnerUsecase struct {
	LearnerRepo domain.LearnerRepositoryI
}

var _ domain.LearnerUsecaseI = (*LearnerUsecase)(nil)

func NewLearnerUsecase(lrp domain.LearnerRepositoryI) *LearnerUsecase {
	return &LearnerUsecase{
		LearnerRepo: lrp,
	}
}

func (u *LearnerUsecase) GetPartnerLearner(ctx context.Context, partnerID *uuid.UUID, learnerID uuid.UUID) (*domain.Learner, error) {
	if u.LearnerRepo == nil {
		return nil, domain.ErrNotFound
	}
	if partnerID != nil && *partnerID != uuid.Nil {
		return u.LearnerRepo.GetByIDAndPartnerID(ctx, learnerID, *partnerID)
	}
	return u.LearnerRepo.GetByID(ctx, learnerID)
}
