package controllers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	domain "bridge/Domain"
	infrastructure "bridge/Infrastructure"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockMeUc struct {
	domain.MeUsecaseI
	getFn    func(ctx context.Context, actor domain.Actor) (*domain.LearnerProfile, error)
	exportFn func(ctx context.Context, actor domain.Actor) (*domain.LearnerExport, error)
	updateFn func(ctx context.Context, actor domain.Actor, changes *domain.ProfileChanges) (*domain.LearnerProfile, error)
	deleteFn func(ctx context.Context, actor domain.Actor) error
}

func (m *mockMeUc) Get(ctx context.Context, actor domain.Actor) (*domain.LearnerProfile, error) {
	if m.getFn != nil {
		return m.getFn(ctx, actor)
	}
	return nil, domain.ErrNotFound
}

func (m *mockMeUc) Export(ctx context.Context, actor domain.Actor) (*domain.LearnerExport, error) {
	if m.exportFn != nil {
		return m.exportFn(ctx, actor)
	}
	return nil, domain.ErrNotFound
}

func (m *mockMeUc) Update(ctx context.Context, actor domain.Actor, changes *domain.ProfileChanges) (*domain.LearnerProfile, error) {
	if m.updateFn != nil {
		return m.updateFn(ctx, actor, changes)
	}
	return nil, domain.ErrNotFound
}

func (m *mockMeUc) Delete(ctx context.Context, actor domain.Actor) error {
	if m.deleteFn != nil {
		return m.deleteFn(ctx, actor)
	}
	return domain.ErrNotFound
}

func TestMeController_Get_Success(t *testing.T) {
	gin.SetMode(gin.TestMode)

	learnerID := uuid.New()
	regID := uuid.New()
	now := time.Now().UTC().Truncate(time.Second)

	mockUc := &mockMeUc{
		getFn: func(ctx context.Context, actor domain.Actor) (*domain.LearnerProfile, error) {
			assert.Equal(t, learnerID, actor.ID)
			return &domain.LearnerProfile{
				Learner: &domain.Learner{
					ID:            learnerID,
					Status:        "registered",
					FullName:      "Sara Kebede",
					PreferredName: "Sara",
					ContactMethod: "phone",
					PhoneE164:     "+251911223344",
					Language:      "am",
					RegisteredAt:  &now,
				},
				Registration: &domain.Registration{
					ID: regID,
				},
			}, nil
		},
	}

	ctrl := NewMeController(mockUc)
	r := gin.New()
	r.GET("/api/v1/me", func(c *gin.Context) {
		// Mock learner actor
		infrastructure.SetActor(c, domain.Actor{
			Kind: domain.ActorLearner,
			ID:   learnerID,
		})
		ctrl.GetMeController(c)
	})

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/me", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	var resp MeDTO
	err := json.Unmarshal(rec.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, learnerID, resp.LearnerID)
	assert.Equal(t, "Sara Kebede", resp.FullName)
	assert.Equal(t, &regID, resp.RegistrationID)
}

func TestMeController_Export_Success(t *testing.T) {
	gin.SetMode(gin.TestMode)

	learnerID := uuid.New()
	regID := uuid.New()
	now := time.Now().UTC().Truncate(time.Second)

	mockUc := &mockMeUc{
		exportFn: func(ctx context.Context, actor domain.Actor) (*domain.LearnerExport, error) {
			assert.Equal(t, learnerID, actor.ID)
			return &domain.LearnerExport{
				ExportedAt: now,
				Profile: &domain.LearnerProfile{
					Learner: &domain.Learner{
						ID:            learnerID,
						Status:        "registered",
						FullName:      "Sara Kebede",
						PreferredName: "Sara",
						ContactMethod: "phone",
						PhoneE164:     "+251911223344",
						Language:      "am",
						RegisteredAt:  &now,
					},
					Registration: &domain.Registration{
						ID:          regID,
						FlowID:      "signup",
						FlowVersion: 1,
						Status:      "submitted",
						CurrentStep: "done",
						CreatedAt:   now,
						UpdatedAt:   now,
					},
				},
				Answers: []*domain.Answer{
					{
						QuestionID:  "full_name",
						Value:       json.RawMessage(`"Sara Kebede"`),
						InputMethod: "text",
						Version:     1,
						UpdatedAt:   now,
					},
				},
				Consents: []*domain.Consent{
					{
						Kind:      "data_processing",
						Granted:   true,
						Method:    "tap",
						CreatedAt: now,
					},
				},
			}, nil
		},
	}

	ctrl := NewMeController(mockUc)
	r := gin.New()
	r.GET("/api/v1/me/export", func(c *gin.Context) {
		infrastructure.SetActor(c, domain.Actor{
			Kind: domain.ActorLearner,
			ID:   learnerID,
		})
		ctrl.ExportMeController(c)
	})

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/me/export", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Header().Get("Content-Disposition"), "attachment; filename=\"bridge-data-")

	var resp MeExportDTO
	err := json.Unmarshal(rec.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, learnerID, resp.Learner.LearnerID)
	assert.Equal(t, "Sara Kebede", resp.Learner.FullName)
	assert.NotNil(t, resp.Registration)
	assert.Equal(t, regID, resp.Registration.ID)
	require.Len(t, resp.Answers, 1)
	assert.Equal(t, "full_name", resp.Answers[0].QuestionID)
	require.Len(t, resp.Consents, 1)
	assert.Equal(t, "data_processing", resp.Consents[0].Kind)
}
