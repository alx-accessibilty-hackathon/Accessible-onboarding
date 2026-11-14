package controllers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	domain "bridge/Domain"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockConsentUsecase struct {
	createConsentFn func(ctx context.Context, registrationID uuid.UUID, consent *domain.Consent) (*domain.Consent, error)
}

func (m *mockConsentUsecase) CreateConsent(ctx context.Context, registrationID uuid.UUID, consent *domain.Consent) (*domain.Consent, error) {
	if m.createConsentFn != nil {
		return m.createConsentFn(ctx, registrationID, consent)
	}
	return nil, domain.ErrNotFound
}

func setupConsentTestRouter(uc domain.ConsentUsecaseI) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	ctrl := NewConsentController(uc)
	r.POST("/api/v1/registrations/:id/consents", ctrl.CreateConsentController)
	return r
}

func TestCreateConsentController_NilUsecase(t *testing.T) {
	r := setupConsentTestRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/registrations/"+uuid.New().String()+"/consents", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotImplemented, w.Code)
}

func TestCreateConsentController_InvalidID(t *testing.T) {
	r := setupConsentTestRouter(&mockConsentUsecase{})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/registrations/not-a-uuid/consents", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var errResp ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &errResp)
	require.NoError(t, err)
	assert.Equal(t, "invalid_id", errResp.Code)
}

func TestCreateConsentController_ValidationError_MissingKind(t *testing.T) {
	r := setupConsentTestRouter(&mockConsentUsecase{})
	body := []byte(`{"granted": true, "method": "tap"}`)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/registrations/"+uuid.New().String()+"/consents", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnprocessableEntity, w.Code)

	var errResp ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &errResp)
	require.NoError(t, err)
	assert.Equal(t, "validation_failed", errResp.Code)
}

func TestCreateConsentController_ValidationError_InvalidKind(t *testing.T) {
	r := setupConsentTestRouter(&mockConsentUsecase{})
	body := []byte(`{"kind": "something_else", "granted": true, "method": "tap"}`)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/registrations/"+uuid.New().String()+"/consents", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnprocessableEntity, w.Code)

	var errResp ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &errResp)
	require.NoError(t, err)
	assert.Equal(t, "validation_failed", errResp.Code)
}

func TestCreateConsentController_ValidationError_MissingGranted(t *testing.T) {
	r := setupConsentTestRouter(&mockConsentUsecase{})
	body := []byte(`{"kind": "cloud_speech", "method": "tap"}`)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/registrations/"+uuid.New().String()+"/consents", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnprocessableEntity, w.Code)
}

func TestCreateConsentController_RegistrationNotFound(t *testing.T) {
	regID := uuid.New()
	uc := &mockConsentUsecase{
		createConsentFn: func(ctx context.Context, id uuid.UUID, consent *domain.Consent) (*domain.Consent, error) {
			assert.Equal(t, regID, id)
			return nil, domain.ErrNotFound
		},
	}
	r := setupConsentTestRouter(uc)
	body := []byte(`{"kind": "cloud_speech", "granted": true, "method": "tap"}`)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/registrations/"+regID.String()+"/consents", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)

	var errResp ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &errResp)
	require.NoError(t, err)
	assert.Equal(t, "not_found", errResp.Code)
}

func TestCreateConsentController_InternalError(t *testing.T) {
	regID := uuid.New()
	uc := &mockConsentUsecase{
		createConsentFn: func(ctx context.Context, id uuid.UUID, consent *domain.Consent) (*domain.Consent, error) {
			return nil, errors.New("unexpected error")
		},
	}
	r := setupConsentTestRouter(uc)
	body := []byte(`{"kind": "cloud_speech", "granted": true, "method": "tap"}`)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/registrations/"+regID.String()+"/consents", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)

	var errResp ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &errResp)
	require.NoError(t, err)
	assert.Equal(t, "internal_error", errResp.Code)
}

func TestCreateConsentController_Success(t *testing.T) {
	regID := uuid.New()
	consentID := uuid.New()
	now := time.Now().UTC()

	uc := &mockConsentUsecase{
		createConsentFn: func(ctx context.Context, id uuid.UUID, consent *domain.Consent) (*domain.Consent, error) {
			assert.Equal(t, regID, id)
			assert.Equal(t, "cloud_speech", consent.Kind)
			assert.True(t, consent.Granted)
			assert.Equal(t, "tap", consent.Method)
			return &domain.Consent{
				ID:        consentID,
				LearnerID: uuid.New(),
				Kind:      consent.Kind,
				Granted:   consent.Granted,
				Method:    consent.Method,
				CreatedAt: now,
			}, nil
		},
	}
	r := setupConsentTestRouter(uc)
	body := []byte(`{"kind": "cloud_speech", "granted": true, "method": "tap"}`)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/registrations/"+regID.String()+"/consents", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var resp ConsentDTO
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	assert.Equal(t, consentID, resp.ID)
	assert.Equal(t, "cloud_speech", resp.Kind)
	assert.True(t, resp.Granted)
	assert.WithinDuration(t, now, resp.CreatedAt, time.Second)
}
