package controllers

import (
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

type mockLearnerUc struct {
	getPartnerLearnerFn func(ctx context.Context, partnerID *uuid.UUID, learnerID uuid.UUID) (*domain.Learner, error)
}

func (m *mockLearnerUc) GetPartnerLearner(ctx context.Context, partnerID *uuid.UUID, learnerID uuid.UUID) (*domain.Learner, error) {
	if m.getPartnerLearnerFn != nil {
		return m.getPartnerLearnerFn(ctx, partnerID, learnerID)
	}
	return nil, domain.ErrNotFound
}

func TestLearnerController_GetPartnerLearner_Success(t *testing.T) {
	gin.SetMode(gin.TestMode)

	learnerID := uuid.New()
	partnerID := uuid.New()
	now := time.Now().UTC().Truncate(time.Second)

	mockUc := &mockLearnerUc{
		getPartnerLearnerFn: func(ctx context.Context, pid *uuid.UUID, lid uuid.UUID) (*domain.Learner, error) {
			assert.Equal(t, learnerID, lid)
			assert.NotNil(t, pid)
			assert.Equal(t, partnerID, *pid)
			return &domain.Learner{
				ID:            learnerID,
				PartnerID:     partnerID,
				Status:        "registered",
				FullName:      "Abebe Bikila",
				PreferredName: "Abebe",
				ContactMethod: "phone",
				PhoneE164:     "+251912345678",
				PhoneVerified: true,
				Language:      "am",
				IdentityLevel: "self_declared",
				RegisteredAt:  &now,
			}, nil
		},
	}

	ctrl := NewLearnerController(mockUc)

	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("actor", &domain.Actor{
			Kind:      domain.ActorPartnerServer,
			PartnerID: partnerID,
			Scopes:    []string{"learners:read"},
		})
		c.Next()
	})
	r.GET("/partner-api/learners/:id", ctrl.GetPartnerLearnerController)

	req := httptest.NewRequest(http.MethodGet, "/partner-api/learners/"+learnerID.String(), nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)

	var resp LearnerDTO
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, learnerID, resp.LearnerID)
	assert.Equal(t, "Abebe", resp.PreferredName)
	assert.Equal(t, "am", resp.Language)
	assert.Equal(t, "registered", resp.Status)
	assert.Equal(t, "self_declared", resp.IdentityLevel)
	assert.Equal(t, "phone", resp.Contact.Method)
	assert.Equal(t, "+251912345678", resp.Contact.Phone)
	assert.True(t, resp.Contact.Verified)
}

func TestLearnerController_GetPartnerLearner_InvalidID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctrl := NewLearnerController(&mockLearnerUc{})

	r := gin.New()
	r.GET("/partner-api/learners/:id", ctrl.GetPartnerLearnerController)

	req := httptest.NewRequest(http.MethodGet, "/partner-api/learners/not-a-uuid", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	var errResp ErrorResponse
	_ = json.Unmarshal(w.Body.Bytes(), &errResp)
	assert.Equal(t, "invalid_id", errResp.Code)
}

func TestLearnerController_GetPartnerLearner_NotFound(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mockUc := &mockLearnerUc{
		getPartnerLearnerFn: func(ctx context.Context, pid *uuid.UUID, lid uuid.UUID) (*domain.Learner, error) {
			return nil, domain.ErrNotFound
		},
	}
	ctrl := NewLearnerController(mockUc)

	r := gin.New()
	r.GET("/partner-api/learners/:id", ctrl.GetPartnerLearnerController)

	req := httptest.NewRequest(http.MethodGet, "/partner-api/learners/"+uuid.New().String(), nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
	var errResp ErrorResponse
	_ = json.Unmarshal(w.Body.Bytes(), &errResp)
	assert.Equal(t, "not_found", errResp.Code)
}

func TestLearnerController_GetPartnerLearner_InternalError(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mockUc := &mockLearnerUc{
		getPartnerLearnerFn: func(ctx context.Context, pid *uuid.UUID, lid uuid.UUID) (*domain.Learner, error) {
			return nil, errors.New("db explosion")
		},
	}
	ctrl := NewLearnerController(mockUc)

	r := gin.New()
	r.GET("/partner-api/learners/:id", ctrl.GetPartnerLearnerController)

	req := httptest.NewRequest(http.MethodGet, "/partner-api/learners/"+uuid.New().String(), nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	var errResp ErrorResponse
	_ = json.Unmarshal(w.Body.Bytes(), &errResp)
	assert.Equal(t, "internal_error", errResp.Code)
}
