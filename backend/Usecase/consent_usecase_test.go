package usecase

import (
	"context"
	"errors"
	"testing"
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockConsentRepo struct {
	createConsentFn func(ctx context.Context, consent *domain.Consent) (*domain.Consent, error)
}

func (m *mockConsentRepo) CreateConsent(ctx context.Context, consent *domain.Consent) (*domain.Consent, error) {
	if m.createConsentFn != nil {
		return m.createConsentFn(ctx, consent)
	}
	return nil, domain.ErrNotFound
}

func (m *mockConsentRepo) GetConsentByLearnerAndKind(ctx context.Context, learnerID uuid.UUID, kind string) (*domain.Consent, error) {
	return nil, domain.ErrNotFound
}

func (m *mockConsentRepo) ListConsentsByLearnerID(ctx context.Context, learnerID uuid.UUID) ([]*domain.Consent, error) {
	return nil, nil
}

type mockRegistrationRepo struct {
	domain.RegistrationRepositoryI // methods these tests don't use
	getRegistrationFn              func(ctx context.Context, id uuid.UUID) (*domain.Registration, error)
}

func (m *mockRegistrationRepo) GetRegistrationByID(ctx context.Context, id uuid.UUID) (*domain.Registration, error) {
	if m.getRegistrationFn != nil {
		return m.getRegistrationFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}

func (m *mockRegistrationRepo) GetAnswer(ctx context.Context, registrationID uuid.UUID, questionID string) (*domain.Answer, error) {
	return nil, domain.ErrNotFound
}

func (m *mockRegistrationRepo) ListAnswersByRegistrationID(ctx context.Context, registrationID uuid.UUID) ([]*domain.Answer, error) {
	return nil, nil
}

func TestCreateConsent_Success(t *testing.T) {
	regID := uuid.New()
	learnerID := uuid.New()
	consentID := uuid.New()
	now := time.Now().UTC()

	regRepo := &mockRegistrationRepo{
		getRegistrationFn: func(ctx context.Context, id uuid.UUID) (*domain.Registration, error) {
			assert.Equal(t, regID, id)
			return &domain.Registration{
				ID:        regID,
				LearnerID: learnerID,
			}, nil
		},
	}

	consentRepo := &mockConsentRepo{
		createConsentFn: func(ctx context.Context, consent *domain.Consent) (*domain.Consent, error) {
			assert.Equal(t, learnerID, consent.LearnerID)
			assert.Equal(t, "cloud_speech", consent.Kind)
			assert.True(t, consent.Granted)
			assert.Equal(t, "tap", consent.Method)
			return &domain.Consent{
				ID:        consentID,
				LearnerID: learnerID,
				Kind:      consent.Kind,
				Granted:   consent.Granted,
				Method:    consent.Method,
				CreatedAt: now,
			}, nil
		},
	}

	uc := NewConsentUsecase(consentRepo, regRepo)
	created, err := uc.CreateConsent(context.Background(), domain.Actor{Kind: domain.ActorLearner, ID: learnerID}, regID, &domain.Consent{
		Kind:    "cloud_speech",
		Granted: true,
		Method:  "tap",
	})
	require.NoError(t, err)
	require.NotNil(t, created)

	assert.Equal(t, consentID, created.ID)
	assert.Equal(t, learnerID, created.LearnerID)
	assert.Equal(t, "cloud_speech", created.Kind)
	assert.True(t, created.Granted)
	assert.Equal(t, "tap", created.Method)
}

func TestCreateConsent_NilRegistrationID(t *testing.T) {
	uc := NewConsentUsecase(&mockConsentRepo{})
	_, err := uc.CreateConsent(context.Background(), domain.Actor{Kind: domain.ActorLearner, ID: uuid.New()}, uuid.Nil, &domain.Consent{
		Kind:    "cloud_speech",
		Granted: true,
		Method:  "tap",
	})
	assert.Error(t, err) // no registration repository
}

func TestCreateConsent_NilConsent(t *testing.T) {
	uc := NewConsentUsecase(&mockConsentRepo{})
	_, err := uc.CreateConsent(context.Background(), domain.Actor{}, uuid.New(), nil)
	assert.Error(t, err)
}

func TestCreateConsent_InvalidKind(t *testing.T) {
	uc := NewConsentUsecase(&mockConsentRepo{})
	_, err := uc.CreateConsent(context.Background(), domain.Actor{}, uuid.New(), &domain.Consent{
		Kind:    "unknown_kind",
		Granted: true,
		Method:  "tap",
	})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "kind: invalid_choice")
}

func TestCreateConsent_InvalidMethod(t *testing.T) {
	uc := NewConsentUsecase(&mockConsentRepo{})
	_, err := uc.CreateConsent(context.Background(), domain.Actor{}, uuid.New(), &domain.Consent{
		Kind:    "cloud_speech",
		Granted: true,
		Method:  "telepathy",
	})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "method: invalid_choice")
}

func TestCreateConsent_RegistrationNotFound(t *testing.T) {
	regRepo := &mockRegistrationRepo{
		getRegistrationFn: func(ctx context.Context, id uuid.UUID) (*domain.Registration, error) {
			return nil, domain.ErrNotFound
		},
	}
	uc := NewConsentUsecase(&mockConsentRepo{}, regRepo)
	_, err := uc.CreateConsent(context.Background(), domain.Actor{Kind: domain.ActorLearner, ID: uuid.New()}, uuid.New(), &domain.Consent{
		Kind:    "cloud_speech",
		Granted: true,
		Method:  "tap",
	})
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestCreateConsent_RepoError(t *testing.T) {
	ownerID := uuid.New()
	regRepo := &mockRegistrationRepo{
		getRegistrationFn: func(ctx context.Context, id uuid.UUID) (*domain.Registration, error) {
			return &domain.Registration{ID: id, LearnerID: ownerID}, nil
		},
	}
	consentRepo := &mockConsentRepo{
		createConsentFn: func(ctx context.Context, consent *domain.Consent) (*domain.Consent, error) {
			return nil, errors.New("db write failure")
		},
	}
	uc := NewConsentUsecase(consentRepo, regRepo)
	_, err := uc.CreateConsent(context.Background(), domain.Actor{Kind: domain.ActorLearner, ID: ownerID}, uuid.New(), &domain.Consent{
		Kind:    "cloud_speech",
		Granted: true,
		Method:  "tap",
	})
	assert.Error(t, err)
	assert.Equal(t, "db write failure", err.Error())
}
