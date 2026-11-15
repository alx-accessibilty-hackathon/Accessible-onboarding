package controllers

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	domain "bridge/Domain"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockSpeechUsecase struct {
	domain.SpeechUsecaseI // methods these tests don't use
	transcribeFn          func(ctx context.Context, audio []byte, language string, stepID string, fieldType string, learnerID *uuid.UUID) (*domain.Transcription, error)
}

func (m *mockSpeechUsecase) Transcribe(ctx context.Context, audio []byte, language string, stepID string, fieldType string, learnerID *uuid.UUID) (*domain.Transcription, error) {
	if m.transcribeFn != nil {
		return m.transcribeFn(ctx, audio, language, stepID, fieldType, learnerID)
	}
	return nil, domain.ErrSpeechUnavailable
}

func setupSpeechTestRouter(uc domain.SpeechUsecaseI) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	ctrl := NewSpeechController(uc)
	r.POST("/api/v1/speech/transcriptions", ctrl.TranscribeController)
	return r
}

func createMultipartRequest(t *testing.T, fieldName string, fileName string, fileContent []byte, extraFields map[string]string) *http.Request {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	if fieldName != "" {
		part, err := writer.CreateFormFile(fieldName, fileName)
		require.NoError(t, err)
		_, err = part.Write(fileContent)
		require.NoError(t, err)
	}

	for k, v := range extraFields {
		err := writer.WriteField(k, v)
		require.NoError(t, err)
	}

	err := writer.Close()
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/speech/transcriptions", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
}

func TestTranscribeController_NilUsecase(t *testing.T) {
	r := setupSpeechTestRouter(nil)
	req := createMultipartRequest(t, "audio", "clip.wav", []byte("audio"), map[string]string{"language": "am"})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotImplemented, w.Code)
}

func TestTranscribeController_MissingAudio(t *testing.T) {
	r := setupSpeechTestRouter(&mockSpeechUsecase{})
	// No audio file field
	req := createMultipartRequest(t, "", "", nil, map[string]string{"language": "am"})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnprocessableEntity, w.Code)

	var errResp ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &errResp)
	require.NoError(t, err)
	assert.Equal(t, "validation_failed", errResp.Code)
}

func TestTranscribeController_EmptyAudio(t *testing.T) {
	r := setupSpeechTestRouter(&mockSpeechUsecase{})
	req := createMultipartRequest(t, "audio", "clip.wav", []byte{}, map[string]string{"language": "am"})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnprocessableEntity, w.Code)
}

func TestTranscribeController_MissingLanguage(t *testing.T) {
	r := setupSpeechTestRouter(&mockSpeechUsecase{})
	// audio provided, but no language field
	req := createMultipartRequest(t, "audio", "clip.wav", []byte("audio"), nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnprocessableEntity, w.Code)
}

func TestTranscribeController_PayloadTooLarge(t *testing.T) {
	r := setupSpeechTestRouter(&mockSpeechUsecase{})
	// Exceed 3 MB (3 * 1024 * 1024 + 1 bytes)
	largeAudio := make([]byte, 3*1024*1024+10)
	req := createMultipartRequest(t, "audio", "clip.wav", largeAudio, map[string]string{"language": "am"})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusRequestEntityTooLarge, w.Code)

	var errResp ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &errResp)
	require.NoError(t, err)
	assert.Equal(t, "payload_too_large", errResp.Code)
}

func TestTranscribeController_SpeechUnavailable(t *testing.T) {
	uc := &mockSpeechUsecase{
		transcribeFn: func(ctx context.Context, audio []byte, language string, stepID string, fieldType string, learnerID *uuid.UUID) (*domain.Transcription, error) {
			return nil, domain.ErrSpeechUnavailable
		},
	}
	r := setupSpeechTestRouter(uc)
	req := createMultipartRequest(t, "audio", "clip.wav", []byte("audio-content"), map[string]string{"language": "am"})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)

	var errResp ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &errResp)
	require.NoError(t, err)
	assert.Equal(t, "speech_unavailable", errResp.Code)
}

func TestTranscribeController_Success(t *testing.T) {
	uc := &mockSpeechUsecase{
		transcribeFn: func(ctx context.Context, audio []byte, language string, stepID string, fieldType string, learnerID *uuid.UUID) (*domain.Transcription, error) {
			assert.Equal(t, "am", language)
			assert.Equal(t, "phone", stepID)
			assert.Equal(t, "phone", fieldType)
			return &domain.Transcription{
				Text:       "0912345678",
				Confidence: 0.95,
				Provider:   "mock",
			}, nil
		},
	}
	r := setupSpeechTestRouter(uc)
	req := createMultipartRequest(t, "audio", "clip.wav", []byte("audio-content"), map[string]string{
		"language":   "am",
		"step_id":    "phone",
		"field_type": "phone",
	})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp TranscriptionDTO
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "0912345678", resp.Transcript)
	assert.Equal(t, 0.95, resp.Confidence)
	assert.Equal(t, "mock", resp.Provider)
}
