package usecase

import (
	"context"
	"errors"
	"testing"

	domain "bridge/Domain"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockPartnerRepo struct {
	domain.PartnerRepositoryI // methods these tests don't use
	partnerFn                 func(ctx context.Context, key string) (*domain.Partner, error)
	referralPartnersFn        func(ctx context.Context) ([]*domain.Partner, error)
	allowedOriginsFn          func(ctx context.Context) ([]string, error)
}

func (m *mockPartnerRepo) GetByPublishableKey(ctx context.Context, key string) (*domain.Partner, error) {
	if m.partnerFn != nil {
		return m.partnerFn(ctx, key)
	}
	return nil, domain.ErrNotFound
}

func (m *mockPartnerRepo) ListReferralPartners(ctx context.Context) ([]*domain.Partner, error) {
	if m.referralPartnersFn != nil {
		return m.referralPartnersFn(ctx)
	}
	return nil, nil
}

func (m *mockPartnerRepo) ListAllowedOrigins(ctx context.Context) ([]string, error) {
	if m.allowedOriginsFn != nil {
		return m.allowedOriginsFn(ctx)
	}
	return nil, nil
}

type mockSpeechService struct {
	serverSpeech bool
	cloudSpeech  bool
}

func (m *mockSpeechService) HasServerSpeech() bool {
	return m.serverSpeech
}

func (m *mockSpeechService) HasCloudSpeech() bool {
	return m.cloudSpeech
}

func (m *mockSpeechService) Transcribe(ctx context.Context, audio []byte, language string, cloudConsent bool) (*domain.Transcription, error) {
	return &domain.Transcription{Text: "mock", Confidence: 0.9, Provider: "mock"}, nil
}

func TestGetConfig_Success_DefaultConfig(t *testing.T) {
	partnerID := uuid.New()
	refPartnerID := uuid.New()

	repo := &mockPartnerRepo{
		partnerFn: func(ctx context.Context, key string) (*domain.Partner, error) {
			assert.Equal(t, "pk_demo_savanna", key)
			return &domain.Partner{
				ID:             partnerID,
				Slug:           "demo-savanna",
				Name:           "Savanna (demo)",
				Kind:           domain.PartnerKindPlatform,
				PublishableKey: "pk_demo_savanna",
				Config:         nil, // tests default fallback
			}, nil
		},
		referralPartnersFn: func(ctx context.Context) ([]*domain.Partner, error) {
			return []*domain.Partner{
				{
					ID:   refPartnerID,
					Name: "AAAPD",
				},
			}, nil
		},
	}

	speech := &mockSpeechService{
		serverSpeech: true,
		cloudSpeech:  true,
	}

	uc := NewConfigUsecase(repo, speech)
	cfg, err := uc.GetConfig(context.Background(), "pk_demo_savanna")
	require.NoError(t, err)
	require.NotNil(t, cfg)

	assert.Equal(t, partnerID, cfg.Partner.ID)
	assert.Equal(t, "Savanna (demo)", cfg.Partner.Name)
	assert.Equal(t, []string{"am", "en"}, cfg.Languages)
	assert.Equal(t, "am", cfg.DefaultLanguage)
	assert.Equal(t, []string{"fayda", "kebele_id", "refugee_id", "unhcr_proof", "other_document", "none"}, cfg.IDRoutes)
	assert.Len(t, cfg.ReferralPartners, 1)
	assert.Equal(t, refPartnerID, cfg.ReferralPartners[0].ID)
	assert.Equal(t, "AAAPD", cfg.ReferralPartners[0].Name)
	assert.Equal(t, "#cc3636", cfg.Theme.Primary)
	assert.Empty(t, cfg.Help.Phone)
	assert.Empty(t, cfg.Help.Telegram)
	assert.True(t, cfg.Speech.Server)
	assert.True(t, cfg.Speech.CloudAvailable)
}

func TestGetConfig_Success_CustomConfig(t *testing.T) {
	partnerID := uuid.New()

	repo := &mockPartnerRepo{
		partnerFn: func(ctx context.Context, key string) (*domain.Partner, error) {
			return &domain.Partner{
				ID:             partnerID,
				Name:           "Custom Partner",
				PublishableKey: "pk_custom",
				Config: map[string]any{
					"languages":        []any{"om", "en"},
					"default_language": "om",
					"id_routes":        []any{"fayda", "kebele_id", "none"},
					"help": map[string]any{
						"phone":    "+251911223344",
						"telegram": "@custom_help",
					},
					"theme": map[string]any{
						"primary": "#123456",
					},
					"speech": map[string]any{
						"server":          false,
						"cloud_available": false,
					},
				},
			}, nil
		},
		referralPartnersFn: func(ctx context.Context) ([]*domain.Partner, error) {
			return []*domain.Partner{}, nil
		},
	}

	uc := NewConfigUsecase(repo)
	cfg, err := uc.GetConfig(context.Background(), "pk_custom")
	require.NoError(t, err)
	require.NotNil(t, cfg)

	assert.Equal(t, []string{"om", "en"}, cfg.Languages)
	assert.Equal(t, "om", cfg.DefaultLanguage)
	assert.Equal(t, []string{"fayda", "kebele_id", "none"}, cfg.IDRoutes)
	assert.Equal(t, "+251911223344", cfg.Help.Phone)
	assert.Equal(t, "@custom_help", cfg.Help.Telegram)
	assert.Equal(t, "#123456", cfg.Theme.Primary)
	assert.False(t, cfg.Speech.Server)
	assert.False(t, cfg.Speech.CloudAvailable)
}

func TestGetConfig_EmptyKey(t *testing.T) {
	repo := &mockPartnerRepo{}
	uc := NewConfigUsecase(repo)

	cfg, err := uc.GetConfig(context.Background(), "")
	assert.ErrorIs(t, err, domain.ErrNotFound)
	assert.Nil(t, cfg)

	cfg, err = uc.GetConfig(context.Background(), "   ")
	assert.ErrorIs(t, err, domain.ErrNotFound)
	assert.Nil(t, cfg)
}

func TestGetConfig_PartnerNotFound(t *testing.T) {
	repo := &mockPartnerRepo{
		partnerFn: func(ctx context.Context, key string) (*domain.Partner, error) {
			return nil, domain.ErrNotFound
		},
	}
	uc := NewConfigUsecase(repo)

	cfg, err := uc.GetConfig(context.Background(), "pk_nonexistent")
	assert.ErrorIs(t, err, domain.ErrNotFound)
	assert.Nil(t, cfg)
}

func TestGetConfig_ReferralPartnerError(t *testing.T) {
	repo := &mockPartnerRepo{
		partnerFn: func(ctx context.Context, key string) (*domain.Partner, error) {
			return &domain.Partner{ID: uuid.New(), Name: "Test"}, nil
		},
		referralPartnersFn: func(ctx context.Context) ([]*domain.Partner, error) {
			return nil, errors.New("db failure")
		},
	}
	uc := NewConfigUsecase(repo)

	cfg, err := uc.GetConfig(context.Background(), "pk_test")
	assert.Error(t, err)
	assert.Nil(t, cfg)
}

func TestGetConfig_DefaultLanguageFallback(t *testing.T) {
	repo := &mockPartnerRepo{
		partnerFn: func(ctx context.Context, key string) (*domain.Partner, error) {
			return &domain.Partner{
				ID:   uuid.New(),
				Name: "Test Partner",
				Config: map[string]any{
					"languages":        []string{"en", "ti"},
					"default_language": "am", // "am" is not in languages
				},
			}, nil
		},
		referralPartnersFn: func(ctx context.Context) ([]*domain.Partner, error) {
			return nil, nil
		},
	}
	uc := NewConfigUsecase(repo)

	cfg, err := uc.GetConfig(context.Background(), "pk_test")
	require.NoError(t, err)
	// Expect fallback to first language "en"
	assert.Equal(t, "en", cfg.DefaultLanguage)
}
