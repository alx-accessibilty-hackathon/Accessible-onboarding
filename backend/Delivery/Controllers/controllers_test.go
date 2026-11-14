package controllers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	domain "bridge/Domain"
	infrastructure "bridge/Infrastructure"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func init() { gin.SetMode(gin.TestMode) }

func TestRespondErrorMapsDomainErrors(t *testing.T) {
	cases := []struct {
		err    error
		status int
		code   string
	}{
		{domain.ErrNotFound, 404, "not_found"},
		{domain.ErrUnauthorized, 401, "unauthorized"},
		{domain.ErrForbidden, 403, "forbidden"},
		{domain.ErrConsentRequired, 403, "consent_required"},
		{domain.ErrAlreadyExists, 409, "already_exists"},
		{domain.ErrAlreadySubmitted, 409, "already_submitted"},
		{domain.ErrRateLimited, 429, "rate_limited"},
		{domain.ErrSpeechUnavailable, 503, "speech_unavailable"},
		{errors.New("pq: password=secret connection refused"), 500, "internal_error"},
	}
	for _, c := range cases {
		w := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(w)
		ctx.Request = httptest.NewRequest(http.MethodGet, "/", nil)
		respondError(ctx, c.err)

		assert.Equal(t, c.status, w.Code, c.code)
		var body ErrorResponse
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
		assert.Equal(t, c.code, body.Code)
		assert.NotContains(t, w.Body.String(), "secret", "internal details never reach the client")
	}
}

func TestRespondErrorValidationAndConflictBodies(t *testing.T) {
	w := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(w)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	respondError(ctx, &domain.ValidationError{Fields: []domain.FieldError{{Field: "full_name", Code: "required"}, {Field: "phone", Code: "required"}}})
	assert.Equal(t, 422, w.Code)
	assert.JSONEq(t, `{"status":422,"code":"validation_failed","title":"Validation failed",
		"errors":[{"field":"full_name","code":"required"},{"field":"phone","code":"required"}]}`, w.Body.String())

	w = httptest.NewRecorder()
	ctx, _ = gin.CreateTestContext(w)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	at := time.Date(2026, 11, 14, 13, 10, 0, 0, time.UTC)
	respondError(ctx, &domain.ConflictError{Current: &domain.Answer{QuestionID: "phone", Value: json.RawMessage(`"+251911000000"`), InputMethod: "typed", Version: 3, UpdatedAt: at}})
	assert.Equal(t, 409, w.Code)
	assert.JSONEq(t, `{"status":409,"code":"answer_conflict","title":"Answer changed on another device",
		"current":{"question_id":"phone","value":"+251911000000","input_method":"typed","version":3,"updated_at":"2026-11-14T13:10:00Z"}}`, w.Body.String())
}

// ---- handlers, with a fake use case ----

type fakeRegistrationUc struct {
	domain.RegistrationUsecaseI // methods not overridden panic if called
	gotActor                    domain.Actor
	gotQuestion                 string
	gotBase                     int
	saveErr                     error
}

func (f *fakeRegistrationUc) SaveAnswer(_ context.Context, actor domain.Actor, regID uuid.UUID, questionID string, value json.RawMessage, inputMethod string, baseVersion int) (*domain.Answer, error) {
	f.gotActor, f.gotQuestion, f.gotBase = actor, questionID, baseVersion
	if f.saveErr != nil {
		return nil, f.saveErr
	}
	return &domain.Answer{RegistrationID: regID, QuestionID: questionID, Value: value, InputMethod: inputMethod, Version: baseVersion + 1}, nil
}

func serve(uc domain.RegistrationUsecaseI, actor domain.Actor, method, path, body string) *httptest.ResponseRecorder {
	r := gin.New()
	r.Use(func(c *gin.Context) { infrastructure.SetActor(c, actor) })
	rc := NewRegistrationController(uc)
	r.PUT("/registrations/:id/answers/:questionId", rc.SaveAnswerController)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(method, path, strings.NewReader(body)))
	return w
}

func TestSaveAnswerHandler(t *testing.T) {
	learner := domain.Actor{Kind: domain.ActorLearner, ID: uuid.New()}
	path := "/registrations/" + uuid.NewString() + "/answers/phone"

	uc := &fakeRegistrationUc{}
	w := serve(uc, learner, http.MethodPut, path, `{"value":"+251912345678","input_method":"voice","base_version":2}`)
	assert.Equal(t, 200, w.Code)
	assert.Equal(t, learner, uc.gotActor, "the actor from the middleware reaches the use case")
	assert.Equal(t, "phone", uc.gotQuestion)
	assert.Equal(t, 2, uc.gotBase)
	assert.Contains(t, w.Body.String(), `"version":3`)

	// The DTO rules answer before the use case is called.
	w = serve(&fakeRegistrationUc{}, learner, http.MethodPut, path, `{"input_method":"telepathy"}`)
	assert.Equal(t, 422, w.Code)
	assert.Contains(t, w.Body.String(), `{"field":"value","code":"required"}`)
	assert.Contains(t, w.Body.String(), `{"field":"input_method","code":"invalid_choice"}`)

	w = serve(&fakeRegistrationUc{}, learner, http.MethodPut, "/registrations/not-a-uuid/answers/phone", `{}`)
	assert.Equal(t, 400, w.Code)

	// A use case error goes through respondError.
	w = serve(&fakeRegistrationUc{saveErr: domain.ErrForbidden}, learner, http.MethodPut, path, `{"value":"x","input_method":"typed","base_version":0}`)
	assert.Equal(t, 403, w.Code)
}

type fakeJobUc struct{ domain.JobUsecaseI }

func (fakeJobUc) GetJobPosting(context.Context, uuid.UUID) (map[string]any, error) {
	return map[string]any{"@type": "JobPosting", "title": "Junior Data Analyst"}, nil
}

func TestJobPostingIsServedAsJSONLD(t *testing.T) {
	r := gin.New()
	r.GET("/jobs/:id/jobposting.jsonld", NewJobController(fakeJobUc{}).GetJobPostingController)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/jobs/"+uuid.NewString()+"/jobposting.jsonld", nil))

	assert.Equal(t, 200, w.Code)
	assert.Equal(t, "application/ld+json; charset=utf-8", w.Header().Get("Content-Type"))
	assert.JSONEq(t, `{"@type":"JobPosting","title":"Junior Data Analyst"}`, w.Body.String())
}
