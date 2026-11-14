package routers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	controllers "bridge/Delivery/Controllers"

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
	})
}

func TestHealth(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	testRouter().ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"status":"ok"}`, w.Body.String())
}

func TestSkeletonRoutesAreRegistered(t *testing.T) {
	routes := []struct{ method, path string }{
		{http.MethodGet, "/api/v1/config"},
		{http.MethodPost, "/api/v1/registrations"},
		{http.MethodPut, "/api/v1/registrations/123/answers/phone"},
		{http.MethodGet, "/api/v1/jobs/123/jobposting.jsonld"},
		{http.MethodPost, "/api/v1/employer/jobs/123/publish"},
		{http.MethodGet, "/api/v1/partner-api/learners"},
	}
	r := testRouter()
	for _, rt := range routes {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(rt.method, rt.path, nil))
		// 501 means the route exists and its handler is still a skeleton (404 would mean a missing route).
		assert.Equal(t, http.StatusNotImplemented, w.Code, "%s %s", rt.method, rt.path)
	}
}
