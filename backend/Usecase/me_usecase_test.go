package usecase

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockProfileRepo struct {
	domain.ProfileRepositoryI
	getLatestRegistrationFn func(ctx context.Context, learnerID uuid.UUID) (*domain.Registration, error)
}

func (m *mockProfileRepo) GetLatestRegistration(ctx context.Context, learnerID uuid.UUID) (*domain.Registration, error) {
	if m.getLatestRegistrationFn != nil {
		return m.getLatestRegistrationFn(ctx, learnerID)
	}
	return nil, domain.ErrNotFound
}

func (m *mockProfileRepo) GetLatestIdentityEvidence(ctx context.Context, learnerID uuid.UUID) (*domain.IdentityEvidence, error) {
	return nil, domain.ErrNotFound
}

func (m *mockProfileRepo) GetSealedSupportRequest(ctx context.Context, learnerID uuid.UUID) (*domain.SealedSupportRequest, error) {
	return nil, domain.ErrNotFound
}

type meMockConsentRepo struct {
	domain.ConsentRepositoryI
	listFn func(ctx context.Context, learnerID uuid.UUID) ([]*domain.Consent, error)
}

func (m *meMockConsentRepo) ListConsentsByLearnerID(ctx context.Context, learnerID uuid.UUID) ([]*domain.Consent, error) {
	if m.listFn != nil {
		return m.listFn(ctx, learnerID)
	}
	return nil, nil
}

func TestMeUsecase_Export_Success(t *testing.T) {
	ctx := context.Background()
	store := newMemStore()
	learnerID := uuid.New()
	partnerID := uuid.New()
	regID := uuid.New()
	now := time.Now().UTC().Truncate(time.Second)

	store.learners[learnerID] = &domain.Learner{
		ID:            learnerID,
		PartnerID:     partnerID,
		Status:        "registered",
		FullName:      "Sara Kebede",
		PreferredName: "Sara",
		ContactMethod: "phone",
		PhoneE164:     "+251911223344",
		PhoneVerified: true,
		Language:      "am",
		SimpleMode:    true,
		RegisteredAt:  &now,
	}

	reg := &domain.Registration{
		ID:          regID,
		LearnerID:   learnerID,
		FlowID:      "signup",
		FlowVersion: 1,
		Status:      "submitted",
		CurrentStep: "done",
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	store.regs[regID] = reg

	store.answers[regID] = map[string]*domain.Answer{
		"full_name": {
			RegistrationID: regID,
			QuestionID:     "full_name",
			Value:          json.RawMessage(`"Sara Kebede"`),
			InputMethod:    "text",
			Version:        1,
			UpdatedAt:      now,
		},
	}

	profileRepo := &mockProfileRepo{
		getLatestRegistrationFn: func(ctx context.Context, lid uuid.UUID) (*domain.Registration, error) {
			return reg, nil
		},
	}

	consentRepo := &meMockConsentRepo{
		listFn: func(ctx context.Context, lid uuid.UUID) ([]*domain.Consent, error) {
			return []*domain.Consent{
				{
					Kind:      "data_processing",
					Granted:   true,
					Method:    "tap",
					CreatedAt: now,
				},
			}, nil
		},
	}

	uc := NewMeUsecase(
		fakeLearners{s: store},
		profileRepo,
		fakePartners{},
		fakeRegistrations{s: store},
		consentRepo,
		nil,
		nil,
	)

	actor := domain.Actor{
		Kind: domain.ActorLearner,
		ID:   learnerID,
	}

	export, err := uc.Export(ctx, actor)
	require.NoError(t, err)
	assert.NotNil(t, export)
	assert.Equal(t, learnerID, export.Profile.Learner.ID)
	assert.Equal(t, "Sara Kebede", export.Profile.Learner.FullName)
	assert.NotNil(t, export.Profile.Registration)
	assert.Equal(t, regID, export.Profile.Registration.ID)
	require.Len(t, export.Answers, 1)
	assert.Equal(t, "full_name", export.Answers[0].QuestionID)
	require.Len(t, export.Consents, 1)
	assert.Equal(t, "data_processing", export.Consents[0].Kind)
}

func TestMeUsecase_Export_AnonymousOrForbidden(t *testing.T) {
	ctx := context.Background()
	store := newMemStore()
	uc := NewMeUsecase(
		fakeLearners{s: store},
		&mockProfileRepo{},
		fakePartners{},
		fakeRegistrations{s: store},
		&meMockConsentRepo{},
		nil,
		nil,
	)

	// Anonymous actor
	_, err := uc.Export(ctx, domain.Actor{})
	assert.ErrorIs(t, err, domain.ErrUnauthorized)

	// Staff actor trying to access /me
	_, err = uc.Export(ctx, domain.Actor{Kind: domain.ActorStaff, ID: uuid.New()})
	assert.ErrorIs(t, err, domain.ErrForbidden)
}
