package usecase

import (
	"context"
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// LearnerUsecase: learners for the partner API (level 2, I3). A partner server only ever
// sees learners who signed up through that partner, and never support needs or ID details
// (the DTO leaves them out). Later also /me (Should).
type LearnerUsecase struct {
	LearnerRepo domain.LearnerRepositoryI
}

var _ domain.LearnerUsecaseI = (*LearnerUsecase)(nil)

func NewLearnerUsecase(lrp domain.LearnerRepositoryI) *LearnerUsecase {
	return &LearnerUsecase{
		LearnerRepo: lrp,
	}
}

const (
	defaultPartnerLearnersPage = 50
	maxPartnerLearnersPage     = 200
)

// GetPartnerLearner returns one learner of the calling partner. Another partner's learner
// looks like it doesn't exist (404).
func (u *LearnerUsecase) GetPartnerLearner(ctx context.Context, partnerID *uuid.UUID, learnerID uuid.UUID) (*domain.Learner, error) {
	if partnerID == nil || *partnerID == uuid.Nil {
		return nil, domain.ErrForbidden
	}
	return u.LearnerRepo.GetByIDAndPartnerID(ctx, learnerID, *partnerID)
}

// ListPartnerLearners returns the calling partner's registered learners, newest first,
// optionally only those changed since updatedSince.
func (u *LearnerUsecase) ListPartnerLearners(ctx context.Context, partnerID *uuid.UUID, updatedSince *time.Time, limit int) ([]*domain.Learner, error) {
	if partnerID == nil || *partnerID == uuid.Nil {
		return nil, domain.ErrForbidden
	}
	if limit <= 0 {
		limit = defaultPartnerLearnersPage
	}
	if limit > maxPartnerLearnersPage {
		limit = maxPartnerLearnersPage
	}
	all, err := u.LearnerRepo.ListByPartnerID(ctx, *partnerID)
	if err != nil {
		return nil, err
	}
	out := make([]*domain.Learner, 0, limit)
	for _, l := range all {
		if l.Status != domain.LearnerStatusRegistered {
			continue // drafts have nothing to share yet
		}
		if updatedSince != nil && !l.UpdatedAt.After(*updatedSince) {
			continue
		}
		out = append(out, l)
		if len(out) == limit {
			break
		}
	}
	return out, nil
}
