package infrastructure

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// In-memory sliding-window rate limiting (same approach as the matric-exam-app backend).
// Estimated count = (requests this window + 1) + (requests last window × overlap still inside
// the sliding window). No Redis needed; limits are per server process.

type rateBucket struct {
	currCount  int
	prevCount  int
	currWindow int64
	lastSeen   time.Time
}

// roll moves the bucket to the current window and returns the estimated request count
// including this request.
func (b *rateBucket) roll(now time.Time, window time.Duration) (estimated float64, retryAfter int64) {
	windowSecs := int64(window.Seconds())
	if windowSecs < 1 {
		windowSecs = 1
	}
	current := now.Unix() / windowSecs
	elapsed := now.Unix() % windowSecs
	weight := float64(windowSecs-elapsed) / float64(windowSecs)

	switch {
	case b.currWindow == current:
		// same window
	case b.currWindow == current-1:
		b.prevCount, b.currCount, b.currWindow = b.currCount, 0, current
	default:
		b.prevCount, b.currCount, b.currWindow = 0, 0, current
	}
	return float64(b.currCount+1) + float64(b.prevCount)*weight, windowSecs - elapsed
}

func tooManyRequests(c *gin.Context, retryAfter int64) {
	c.Header("Retry-After", strconv.FormatInt(retryAfter, 10))
	// Same shape as Controllers.ErrorResponse (Infrastructure can't import Delivery).
	c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
		"status": http.StatusTooManyRequests,
		"code":   "rate_limited",
	})
}

// IPRateLimiter limits requests per client IP. Use one on all routes, and stricter
// ones on sign-in, codes and new registrations (Q3).
type IPRateLimiter struct {
	limit   int
	window  time.Duration
	mu      sync.Mutex
	buckets map[string]*rateBucket
}

func NewIPRateLimiter(limit int, window time.Duration) *IPRateLimiter {
	rl := &IPRateLimiter{limit: limit, window: window, buckets: make(map[string]*rateBucket)}
	go rl.cleanup()
	return rl
}

// cleanup drops buckets not seen for two windows so memory doesn't grow forever.
func (r *IPRateLimiter) cleanup() {
	ticker := time.NewTicker(r.window)
	defer ticker.Stop()
	for range ticker.C {
		r.mu.Lock()
		cutoff := time.Now().Add(-2 * r.window)
		for key, b := range r.buckets {
			if b.lastSeen.Before(cutoff) {
				delete(r.buckets, key)
			}
		}
		r.mu.Unlock()
	}
}

func (r *IPRateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		now := time.Now()
		key := c.ClientIP()

		r.mu.Lock()
		b, ok := r.buckets[key]
		if !ok {
			b = &rateBucket{}
			r.buckets[key] = b
		}
		estimated, retryAfter := b.roll(now, r.window)
		if estimated > float64(r.limit) {
			r.mu.Unlock()
			tooManyRequests(c, retryAfter)
			return
		}
		b.currCount++
		b.lastSeen = now
		r.mu.Unlock()

		c.Next()
	}
}

// GlobalRateLimiter limits all requests together, protecting the server as a whole.
type GlobalRateLimiter struct {
	limit  int
	window time.Duration
	mu     sync.Mutex
	bucket rateBucket
}

func NewGlobalRateLimiter(limit int, window time.Duration) *GlobalRateLimiter {
	return &GlobalRateLimiter{limit: limit, window: window}
}

func (g *GlobalRateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		g.mu.Lock()
		estimated, retryAfter := g.bucket.roll(time.Now(), g.window)
		if estimated > float64(g.limit) {
			g.mu.Unlock()
			tooManyRequests(c, retryAfter)
			return
		}
		g.bucket.currCount++
		g.mu.Unlock()

		c.Next()
	}
}
