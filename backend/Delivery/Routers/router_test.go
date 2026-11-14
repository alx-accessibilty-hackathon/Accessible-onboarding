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

// Every route exists (404 would mean a missing route). The requests are invalid on purpose
// (no body, "123" is not a UUID), so the handlers answer before calling the use cases,
// which are nil here. 501 means the handler is still a skeleton.
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
		{http.MethodPost, "/api/v1/employer/jobs", http.StatusBadRequest},
		{http.MethodPost, "/api/v1/employer/jobs/123/publish", http.StatusBadRequest},
		{http.MethodGet, "/api/v1/partner-api/learners", http.StatusNotImplemented},
	}
	r := testRouter()
	for _, rt := range routes {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(rt.method, rt.path, nil))
		assert.Equal(t, rt.want, w.Code, "%s %s", rt.method, rt.path)
	}
}
