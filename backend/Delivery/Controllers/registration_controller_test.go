package controllers

import (
	"bytes"
	"context"
	"encoding/json"
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

type mockRegistrationUc struct {
	domain.RegistrationUsecaseI // the sign-up methods (Dev A) are not used by these tests
	resumeLookupFn              func(ctx context.Context, codeOrToken string) (*domain.ResumeLookupResult, error)
	resumeVerifyFn              func(ctx context.Context, codeOrToken string, dob *domain.ResumeDOB, phoneLast4 string) (*domain.ResumeVerifyResult, int, error)
	sendConsentCodeFn           func(ctx context.Context, actor domain.Actor, registrationID uuid.UUID) (string, error)
	handleTelegramWebhookFn     func(ctx context.Context, update *domain.TelegramUpdate) error
}

func (m *mockRegistrationUc) ResumeLookup(ctx context.Context, codeOrToken string) (*domain.ResumeLookupResult, error) {
	if m.resumeLookupFn != nil {
		return m.resumeLookupFn(ctx, codeOrToken)
	}
	return nil, domain.ErrNotFound
}

func (m *mockRegistrationUc) ResumeVerify(ctx context.Context, codeOrToken string, dob *domain.ResumeDOB, phoneLast4 string) (*domain.ResumeVerifyResult, int, error) {
	if m.resumeVerifyFn != nil {
		return m.resumeVerifyFn(ctx, codeOrToken, dob, phoneLast4)
	}
	return nil, 0, domain.ErrNotFound
}

func (m *mockRegistrationUc) SendConsentCode(ctx context.Context, actor domain.Actor, registrationID uuid.UUID) (string, error) {
	if m.sendConsentCodeFn != nil {
		return m.sendConsentCodeFn(ctx, actor, registrationID)
	}
	return "", domain.ErrNotFound
}

func (m *mockRegistrationUc) HandleTelegramWebhook(ctx context.Context, update *domain.TelegramUpdate) error {
	if m.handleTelegramWebhookFn != nil {
		return m.handleTelegramWebhookFn(ctx, update)
	}
	return nil
}

func TestRegistrationController_ResumeLookup_Success(t *testing.T) {
	gin.SetMode(gin.TestMode)
	regID := uuid.New()

	mockUc := &mockRegistrationUc{
		resumeLookupFn: func(ctx context.Context, codeOrToken string) (*domain.ResumeLookupResult, error) {
			assert.Equal(t, "K7M9P2", codeOrToken)
			return &domain.ResumeLookupResult{
				RegistrationID: regID,
				Check:          "dob",
			}, nil
		},
	}

	ctrl := NewRegistrationController(mockUc)
	r := gin.New()
	r.POST("/resume/lookup", ctrl.ResumeLookupController)

	body, _ := json.Marshal(ResumeLookupRequest{Code: "K7M9P2"})
	req := httptest.NewRequest(http.MethodPost, "/resume/lookup", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	var resp ResumeLookupResponse
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, regID, resp.RegistrationID)
	assert.Equal(t, "dob", resp.Check)
}

func TestRegistrationController_ResumeLookup_Errors(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name       string
		ucErr      error
		wantStatus int
		wantCode   string
	}{
		{"NotFound", domain.ErrNotFound, http.StatusNotFound, "resume_not_found"},
		{"Expired", domain.ErrResumeExpired, http.StatusGone, "resume_expired"},
		{"TooManyAttempts", domain.ErrTooManyAttempts, http.StatusTooManyRequests, "too_many_attempts"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockUc := &mockRegistrationUc{
				resumeLookupFn: func(ctx context.Context, codeOrToken string) (*domain.ResumeLookupResult, error) {
					return nil, tt.ucErr
				},
			}
			ctrl := NewRegistrationController(mockUc)
			r := gin.New()
			r.POST("/resume/lookup", ctrl.ResumeLookupController)

			body, _ := json.Marshal(ResumeLookupRequest{Code: "TESTCD"})
			req := httptest.NewRequest(http.MethodPost, "/resume/lookup", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			assert.Equal(t, tt.wantStatus, w.Code)
			var errResp ErrorResponse
			_ = json.Unmarshal(w.Body.Bytes(), &errResp)
			assert.Equal(t, tt.wantCode, errResp.Code)
		})
	}
}

func TestRegistrationController_ResumeVerify_Success(t *testing.T) {
	gin.SetMode(gin.TestMode)
	regID := uuid.New()
	exp := time.Now().Add(30 * 24 * time.Hour).UTC().Truncate(time.Second)

	mockUc := &mockRegistrationUc{
		resumeVerifyFn: func(ctx context.Context, codeOrToken string, dob *domain.ResumeDOB, phoneLast4 string) (*domain.ResumeVerifyResult, int, error) {
			assert.Equal(t, "K7M9P2", codeOrToken)
			assert.Equal(t, 1995, dob.Year)
			return &domain.ResumeVerifyResult{
				RegistrationID: regID,
				SessionToken:   "lt_test_token_123",
				ExpiresAt:      exp,
			}, 5, nil
		},
	}

	ctrl := NewRegistrationController(mockUc)
	r := gin.New()
	r.POST("/resume/verify", ctrl.ResumeVerifyController)

	body, _ := json.Marshal(ResumeVerifyRequest{
		Code: "K7M9P2",
		DOB: &ResumeDOB{
			Calendar: "ethiopian",
			Year:     1995,
			Month:    4,
			Day:      12,
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/resume/verify", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	var resp ResumeVerifyResponse
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, regID, resp.RegistrationID)
	assert.Equal(t, "lt_test_token_123", resp.Session.Token)
	assert.Equal(t, exp.Format(time.RFC3339), resp.Session.ExpiresAt)
}

func TestRegistrationController_ResumeVerify_FailedCheck(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mockUc := &mockRegistrationUc{
		resumeVerifyFn: func(ctx context.Context, codeOrToken string, dob *domain.ResumeDOB, phoneLast4 string) (*domain.ResumeVerifyResult, int, error) {
			return nil, 3, domain.ErrResumeCheckFailed
		},
	}

	ctrl := NewRegistrationController(mockUc)
	r := gin.New()
	r.POST("/resume/verify", ctrl.ResumeVerifyController)

	body, _ := json.Marshal(ResumeVerifyRequest{
		Code: "K7M9P2",
		DOB: &ResumeDOB{
			Year: 1990,
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/resume/verify", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	var errResp map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &errResp)
	assert.Equal(t, "resume_check_failed", errResp["code"])
	assert.Equal(t, float64(3), errResp["attempts_left"])
}

func TestRegistrationController_SendConsentCode_Success(t *testing.T) {
	gin.SetMode(gin.TestMode)
	regID := uuid.New()
	phone := "+251912345678"

	mockUc := &mockRegistrationUc{
		sendConsentCodeFn: func(ctx context.Context, _ domain.Actor, id uuid.UUID) (string, error) {
			assert.Equal(t, regID, id)
			return phone, nil
		},
	}

	ctrl := NewRegistrationController(mockUc)
	r := gin.New()
	r.POST("/partner/registrations/:id/consent-code", ctrl.SendConsentCodeController)

	req := httptest.NewRequest(http.MethodPost, "/partner/registrations/"+regID.String()+"/consent-code", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	var resp SendConsentCodeResponse
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "sent", resp.Status)
	assert.Equal(t, phone, resp.Phone)
	assert.Equal(t, 600, resp.ExpiresIn)
}

func TestRegistrationController_TelegramWebhook_Success(t *testing.T) {
	gin.SetMode(gin.TestMode)
	called := false

	mockUc := &mockRegistrationUc{
		handleTelegramWebhookFn: func(ctx context.Context, update *domain.TelegramUpdate) error {
			called = true
			assert.Equal(t, 12345, update.UpdateID)
			return nil
		},
	}

	ctrl := NewRegistrationController(mockUc)
	r := gin.New()
	r.POST("/telegram/webhook", ctrl.TelegramWebhookController)

	update := domain.TelegramUpdate{
		UpdateID: 12345,
		Message: &domain.TelegramMessage{
			MessageID: 1,
			Text:      "/start K7M9P2",
		},
	}
	body, _ := json.Marshal(update)
	req := httptest.NewRequest(http.MethodPost, "/telegram/webhook", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	assert.True(t, called)
	var resp TelegramWebhookResponse
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.True(t, resp.OK)
}
