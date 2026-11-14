package usecase

import (
	"context"
	"testing"
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockLearnerRepo struct {
	domain.LearnerRepositoryI // methods these tests don't use
	getByIDFn                 func(ctx context.Context, id uuid.UUID) (*domain.Learner, error)
	getByIDAndPartnerIDFn     func(ctx context.Context, id uuid.UUID, partnerID uuid.UUID) (*domain.Learner, error)
	listByPartnerIDFn         func(ctx context.Context, partnerID uuid.UUID) ([]*domain.Learner, error)
}

func (m *mockLearnerRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Learner, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}

func (m *mockLearnerRepo) GetByIDAndPartnerID(ctx context.Context, id uuid.UUID, partnerID uuid.UUID) (*domain.Learner, error) {
	if m.getByIDAndPartnerIDFn != nil {
		return m.getByIDAndPartnerIDFn(ctx, id, partnerID)
	}
	return nil, domain.ErrNotFound
}

func (m *mockLearnerRepo) ListByPartnerID(ctx context.Context, partnerID uuid.UUID) ([]*domain.Learner, error) {
	if m.listByPartnerIDFn != nil {
		return m.listByPartnerIDFn(ctx, partnerID)
	}
	return nil, nil
}

func TestLearnerUsecase_GetPartnerLearner_WithPartnerID(t *testing.T) {
	learnerID := uuid.New()
	partnerID := uuid.New()
	now := time.Now().UTC()

	expected := &domain.Learner{
		ID:            learnerID,
		PartnerID:     partnerID,
		Status:        "registered",
		FullName:      "Abebe Kebede",
		PreferredName: "Abebe",
		ContactMethod: "phone",
		PhoneE164:     "+251912345678",
		PhoneVerified: true,
		Language:      "am",
		RegisteredAt:  &now,
	}

	repo := &mockLearnerRepo{
		getByIDAndPartnerIDFn: func(ctx context.Context, id, pid uuid.UUID) (*domain.Learner, error) {
			assert.Equal(t, learnerID, id)
			assert.Equal(t, partnerID, pid)
			return expected, nil
		},
	}

	uc := NewLearnerUsecase(repo)
	res, err := uc.GetPartnerLearner(context.Background(), &partnerID, learnerID)
	require.NoError(t, err)
	assert.Equal(t, expected, res)
}

func TestLearnerUsecase_GetPartnerLearner_WithoutPartnerID(t *testing.T) {
	learnerID := uuid.New()
	expected := &domain.Learner{
		ID:       learnerID,
		Status:   "registered",
		FullName: "Abebe Kebede",
	}

	repo := &mockLearnerRepo{
		getByIDFn: func(ctx context.Context, id uuid.UUID) (*domain.Learner, error) {
			assert.Equal(t, learnerID, id)
			return expected, nil
		},
	}

	// Without a signed-in partner server nothing is returned: no partner, no learner (Q7).
	uc := NewLearnerUsecase(repo)
	res, err := uc.GetPartnerLearner(context.Background(), nil, learnerID)
	assert.ErrorIs(t, err, domain.ErrForbidden)
	assert.Nil(t, res)
	_ = expected
}

func TestLearnerUsecase_GetPartnerLearner_NotFound(t *testing.T) {
	repo := &mockLearnerRepo{
		getByIDAndPartnerIDFn: func(ctx context.Context, id uuid.UUID, partnerID uuid.UUID) (*domain.Learner, error) {
			return nil, domain.ErrNotFound
		},
	}

	partnerID := uuid.New()
	uc := NewLearnerUsecase(repo)
	res, err := uc.GetPartnerLearner(context.Background(), &partnerID, uuid.New())
	require.ErrorIs(t, err, domain.ErrNotFound)
	assert.Nil(t, res)
}
