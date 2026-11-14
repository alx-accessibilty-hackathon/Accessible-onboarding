package infrastructure

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func limitedRouter(mw gin.HandlerFunc) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(mw)
	r.GET("/", func(c *gin.Context) { c.Status(http.StatusOK) })
	return r
}

func hit(r *gin.Engine, ip string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = ip + ":1234"
	r.ServeHTTP(w, req)
	return w
}

func TestIPRateLimiterBlocksAfterLimit(t *testing.T) {
	r := limitedRouter(NewIPRateLimiter(2, time.Hour).Middleware())

	assert.Equal(t, http.StatusOK, hit(r, "10.0.0.1").Code)
	assert.Equal(t, http.StatusOK, hit(r, "10.0.0.1").Code)

	w := hit(r, "10.0.0.1")
	assert.Equal(t, http.StatusTooManyRequests, w.Code)
	assert.NotEmpty(t, w.Header().Get("Retry-After"))
	assert.JSONEq(t, `{"status":429,"code":"rate_limited"}`, w.Body.String())

	// A different IP has its own allowance.
	assert.Equal(t, http.StatusOK, hit(r, "10.0.0.2").Code)
}

func TestGlobalRateLimiterCountsEveryone(t *testing.T) {
	r := limitedRouter(NewGlobalRateLimiter(2, time.Hour).Middleware())

	assert.Equal(t, http.StatusOK, hit(r, "10.0.0.1").Code)
	assert.Equal(t, http.StatusOK, hit(r, "10.0.0.2").Code)
	assert.Equal(t, http.StatusTooManyRequests, hit(r, "10.0.0.3").Code)
}
