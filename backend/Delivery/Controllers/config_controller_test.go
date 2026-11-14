package controllers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	domain "bridge/Domain"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockConfigUsecase struct {
	getConfigFn func(ctx context.Context, partnerKey string) (*domain.ClientConfig, error)
}

func (m *mockConfigUsecase) GetConfig(ctx context.Context, partnerKey string) (*domain.ClientConfig, error) {
	if m.getConfigFn != nil {
		return m.getConfigFn(ctx, partnerKey)
	}
	return nil, domain.ErrNotFound
}

func setupConfigTestRouter(uc domain.ConfigUsecaseI) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	ctrl := NewConfigController(uc)
	r.GET("/api/v1/config", ctrl.GetConfigController)
	return r
}

func TestGetConfigController_NilUsecase(t *testing.T) {
	r := setupConfigTestRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/config", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotImplemented, w.Code)
}

func TestGetConfigController_MissingKey(t *testing.T) {
	uc := &mockConfigUsecase{}
	r := setupConfigTestRouter(uc)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/config", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)

	var errResp ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &errResp)
	require.NoError(t, err)
	assert.Equal(t, "unauthorized", errResp.Code)
}

func TestGetConfigController_PartnerNotFound(t *testing.T) {
	uc := &mockConfigUsecase{
		getConfigFn: func(ctx context.Context, partnerKey string) (*domain.ClientConfig, error) {
			assert.Equal(t, "pk_invalid", partnerKey)
			return nil, domain.ErrNotFound
		},
	}
	r := setupConfigTestRouter(uc)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/config", nil)
	req.Header.Set("X-Partner-Key", "pk_invalid")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)

	var errResp ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &errResp)
	require.NoError(t, err)
	assert.Equal(t, "unauthorized", errResp.Code)
}

func TestGetConfigController_InternalError(t *testing.T) {
	uc := &mockConfigUsecase{
		getConfigFn: func(ctx context.Context, partnerKey string) (*domain.ClientConfig, error) {
			return nil, errors.New("db connection timeout")
		},
	}
	r := setupConfigTestRouter(uc)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/config", nil)
	req.Header.Set("X-Partner-Key", "pk_demo")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)

	var errResp ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &errResp)
	require.NoError(t, err)
	assert.Equal(t, "internal_error", errResp.Code)
}

func TestGetConfigController_Success(t *testing.T) {
	partnerID := uuid.New()
	refID := uuid.New()

	uc := &mockConfigUsecase{
		getConfigFn: func(ctx context.Context, partnerKey string) (*domain.ClientConfig, error) {
			assert.Equal(t, "pk_demo_savanna", partnerKey)
			return &domain.ClientConfig{
				Partner: domain.PartnerRef{
					ID:   partnerID,
					Name: "Savanna (demo)",
				},
				Languages:        []string{"am", "en"},
				DefaultLanguage:  "am",
				IDRoutes:         []string{"fayda", "kebele_id", "refugee_id", "unhcr_proof", "other_document", "none"},
				ReferralPartners: []domain.PartnerRef{{ID: refID, Name: "AAAPD"}},
				Help: domain.HelpConfig{
					Phone:    "+251 11 000 0000",
					Telegram: "@bridge_help_demo",
				},
				Theme: domain.ThemeConfig{
					Primary: "#cc3636",
				},
				Speech: domain.SpeechFlags{
					Server:         true,
					CloudAvailable: true,
				},
			}, nil
		},
	}
	r := setupConfigTestRouter(uc)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/config", nil)
	req.Header.Set("X-Partner-Key", "pk_demo_savanna")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp ConfigDTO
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	assert.Equal(t, partnerID, resp.Partner.ID)
	assert.Equal(t, "Savanna (demo)", resp.Partner.Name)
	assert.Equal(t, []string{"am", "en"}, resp.Languages)
	assert.Equal(t, "am", resp.DefaultLanguage)
	assert.Equal(t, []string{"fayda", "kebele_id", "refugee_id", "unhcr_proof", "other_document", "none"}, resp.IDRoutes)
	assert.Len(t, resp.ReferralPartners, 1)
	assert.Equal(t, refID, resp.ReferralPartners[0].ID)
	assert.Equal(t, "AAAPD", resp.ReferralPartners[0].Name)
	assert.Equal(t, "+251 11 000 0000", resp.Help.Phone)
	assert.Equal(t, "@bridge_help_demo", resp.Help.Telegram)
	assert.Equal(t, "#cc3636", resp.Theme.Primary)
	assert.True(t, resp.Speech.Server)
	assert.True(t, resp.Speech.CloudAvailable)
}

func TestGetConfigController_KeyInQueryParam(t *testing.T) {
	partnerID := uuid.New()

	uc := &mockConfigUsecase{
		getConfigFn: func(ctx context.Context, partnerKey string) (*domain.ClientConfig, error) {
			assert.Equal(t, "pk_demo_savanna", partnerKey)
			return &domain.ClientConfig{
				Partner: domain.PartnerRef{
					ID:   partnerID,
					Name: "Savanna (demo)",
				},
				Languages:       []string{"am", "en"},
				DefaultLanguage: "am",
				IDRoutes:        []string{"fayda", "none"},
				Theme:           domain.ThemeConfig{Primary: "#cc3636"},
			}, nil
		},
	}
	r := setupConfigTestRouter(uc)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/config?partner=pk_demo_savanna", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp ConfigDTO
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, partnerID, resp.Partner.ID)
}
