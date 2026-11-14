package routers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"time"

	controllers "bridge/Delivery/Controllers"
	infrastructure "bridge/Infrastructure"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// testRouter builds the router with controllers that have no use cases behind them.
// That is enough while every handler is still a skeleton.
func testRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	return SetupRouter(&Controllers{
		Config:       controllers.NewConfigController(nil),
		Registration: controllers.NewRegistrationController(nil),
		Support:      controllers.NewSupportController(nil),
		Consent:      controllers.NewConsentController(nil),
		Auth:         controllers.NewAuthController(nil),
		Speech:       controllers.NewSpeechController(nil),
		Job:          controllers.NewJobController(nil),
		Application:  controllers.NewApplicationController(nil),
		Learner:      controllers.NewLearnerController(nil),
	}, &Middlewares{
		IPLimiter:     infrastructure.NewIPRateLimiter(1000, time.Minute),
		GlobalLimiter: infrastructure.NewGlobalRateLimiter(1000, time.Minute),
	})
}

func TestHealth(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	testRouter().ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"status":"ok"}`, w.Body.String())
}

func TestOpenAPI(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/openapi.yaml", nil)
	testRouter().ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "openapi: 3.0.3")
	assert.Contains(t, w.Header().Get("Content-Type"), "application/yaml")
}

func TestDocs(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/docs", nil)
	testRouter().ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "swagger-ui")
	assert.Contains(t, w.Header().Get("Content-Type"), "text/html")
}

// Every route exists (404 would mean a missing route). The use cases are nil here, so the
// requests are invalid on purpose (no body, "123" is not a UUID) and the handlers answer
// before calling them; 501 means the handler has no use case behind it. Without a token,
// role- and scope-protected routes answer 401.
func TestRoutesAreRegistered(t *testing.T) {
	routes := []struct {
		method, path string
		want         int
	}{
		{http.MethodGet, "/api/v1/config", http.StatusNotImplemented},
		{http.MethodPost, "/api/v1/registrations", http.StatusBadRequest},
		{http.MethodGet, "/api/v1/registrations/123", http.StatusBadRequest},
		{http.MethodPatch, "/api/v1/registrations/123", http.StatusBadRequest},
		{http.MethodPut, "/api/v1/registrations/123/answers/phone", http.StatusBadRequest},
		{http.MethodPut, "/api/v1/registrations/123/support-request", http.StatusBadRequest},
		{http.MethodPost, "/api/v1/registrations/123/submit", http.StatusBadRequest},
		{http.MethodGet, "/api/v1/jobs?limit=500", http.StatusUnprocessableEntity},
		{http.MethodGet, "/api/v1/jobs/123", http.StatusBadRequest},
		{http.MethodGet, "/api/v1/jobs/123/jobposting.jsonld", http.StatusBadRequest},
		{http.MethodPost, "/api/v1/jobs/123/applications", http.StatusBadRequest},
		{http.MethodPost, "/api/v1/employer/jobs", http.StatusUnauthorized}, // employer role needed
		{http.MethodPost, "/api/v1/employer/jobs/123/publish", http.StatusUnauthorized},
		{http.MethodGet, "/api/v1/partner-api/learners", http.StatusUnauthorized}, // scope needed
		{http.MethodGet, "/api/v1/partner-api/learners/123", http.StatusUnauthorized},
		{http.MethodPost, "/api/v1/resume/lookup", http.StatusNotImplemented},
		{http.MethodPost, "/api/v1/resume/verify", http.StatusNotImplemented},
		{http.MethodPost, "/api/v1/partner/registrations/123/consent-code", http.StatusUnauthorized},
		{http.MethodPost, "/api/v1/telegram/webhook", http.StatusNotImplemented},
	}
	r := testRouter()
	for _, rt := range routes {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(rt.method, rt.path, nil))
		assert.Equal(t, rt.want, w.Code, "%s %s", rt.method, rt.path)
	}
}
