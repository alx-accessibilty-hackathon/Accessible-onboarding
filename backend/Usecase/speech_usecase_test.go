package usecase

import (
	"context"
	"testing"

	domain "bridge/Domain"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockSpeechServ struct {
	domain.SpeechService // methods these tests don't use
	transcribeFn         func(ctx context.Context, audio []byte, language string, cloudConsent bool) (*domain.Transcription, error)
}

func (m *mockSpeechServ) HasServerSpeech() bool {
	return true
}

func (m *mockSpeechServ) HasCloudSpeech() bool {
	return true
}

func (m *mockSpeechServ) Transcribe(ctx context.Context, audio []byte, language string, cloudConsent bool) (*domain.Transcription, error) {
	if m.transcribeFn != nil {
		return m.transcribeFn(ctx, audio, language, cloudConsent)
	}
	return &domain.Transcription{Text: "default", Confidence: 0.9, Provider: "mock"}, nil
}

type mockConsentRepoForSpeech struct {
	getConsentFn func(ctx context.Context, learnerID uuid.UUID, kind string) (*domain.Consent, error)
}

func (m *mockConsentRepoForSpeech) CreateConsent(ctx context.Context, consent *domain.Consent) (*domain.Consent, error) {
	return nil, nil
}

func (m *mockConsentRepoForSpeech) GetConsentByLearnerAndKind(ctx context.Context, learnerID uuid.UUID, kind string) (*domain.Consent, error) {
	if m.getConsentFn != nil {
		return m.getConsentFn(ctx, learnerID, kind)
	}
	return nil, domain.ErrNotFound
}

func (m *mockConsentRepoForSpeech) ListConsentsByLearnerID(ctx context.Context, learnerID uuid.UUID) ([]*domain.Consent, error) {
	return nil, nil
}

func TestSpeechUsecase_EmptyAudio(t *testing.T) {
	uc := NewSpeechUsecase(nil, &mockSpeechServ{})
	_, err := uc.Transcribe(context.Background(), nil, "am", "phone", "phone", nil)
	assert.Error(t, err)
}

func TestSpeechUsecase_NilService(t *testing.T) {
	uc := NewSpeechUsecase(nil, nil)
	_, err := uc.Transcribe(context.Background(), []byte("audio"), "am", "phone", "phone", nil)
	assert.ErrorIs(t, err, domain.ErrSpeechUnavailable)
}

func TestSpeechUsecase_Transcribe_WithoutConsent(t *testing.T) {
	learnerID := uuid.New()
	consentRepo := &mockConsentRepoForSpeech{
		getConsentFn: func(ctx context.Context, id uuid.UUID, kind string) (*domain.Consent, error) {
			assert.Equal(t, learnerID, id)
			assert.Equal(t, "cloud_speech", kind)
			return nil, domain.ErrNotFound
		},
	}

	speechServ := &mockSpeechServ{
		transcribeFn: func(ctx context.Context, audio []byte, language string, cloudConsent bool) (*domain.Transcription, error) {
			assert.False(t, cloudConsent, "cloud consent must be false when no consent record exists")
			assert.Equal(t, "am", language)
			return &domain.Transcription{
				Text:       "0912345678",
				Confidence: 0.95,
				Provider:   "local", // a real on-device provider: its text passes through (the "mock" one returns field samples)
			}, nil
		},
	}

	uc := NewSpeechUsecase(consentRepo, speechServ)
	result, err := uc.Transcribe(context.Background(), []byte("fake-audio"), "am", "phone", "phone", &learnerID)
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, "0912345678", result.Text)
	assert.Equal(t, "local", result.Provider)
}

func TestSpeechUsecase_Transcribe_WithConsent(t *testing.T) {
	learnerID := uuid.New()
	consentRepo := &mockConsentRepoForSpeech{
		getConsentFn: func(ctx context.Context, id uuid.UUID, kind string) (*domain.Consent, error) {
			return &domain.Consent{
				LearnerID: learnerID,
				Kind:      "cloud_speech",
				Granted:   true,
			}, nil
		},
	}

	speechServ := &mockSpeechServ{
		transcribeFn: func(ctx context.Context, audio []byte, language string, cloudConsent bool) (*domain.Transcription, error) {
			assert.True(t, cloudConsent, "cloud consent must be true when granted")
			return &domain.Transcription{
				Text:       "ዜሮ ዘጠኝ አንድ ሁለት",
				Confidence: 0.88,
				Provider:   "azure",
			}, nil
		},
	}

	uc := NewSpeechUsecase(consentRepo, speechServ)
	result, err := uc.Transcribe(context.Background(), []byte("fake-audio"), "am", "phone", "phone", &learnerID)
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, "ዜሮ ዘጠኝ አንድ ሁለት", result.Text)
	assert.Equal(t, "azure", result.Provider)
}
