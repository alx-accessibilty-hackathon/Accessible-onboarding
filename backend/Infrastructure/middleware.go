package infrastructure

import (
	"context"
	"crypto/subtle"
	"errors"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	domain "bridge/Domain"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ---- Who is calling ----

const actorKey = "bridge.actor"

// SetActor stores the caller in the request. The sign-in middlewares below call it once they
// have checked the partner key or token.
func SetActor(c *gin.Context, a domain.Actor) {
	c.Set(actorKey, a)
}

// ActorFrom returns the caller stored by SetActor, or an anonymous actor if there is none.
// Controllers pass it to the use cases, which decide what the caller may see or change.
func ActorFrom(c *gin.Context) domain.Actor {
	if v, ok := c.Get(actorKey); ok {
		if a, ok := v.(domain.Actor); ok {
			return a
		}
	}
	return domain.Actor{Kind: domain.ActorAnonymous}
}

// abort answers with the shared error shape { status, code, title }.
func abort(c *gin.Context, status int, code, title string) {
	c.AbortWithStatusJSON(status, gin.H{"status": status, "code": code, "title": title})
}

// ---- What the middlewares need (implemented by repositories and the auth use case) ----

// TokenResolver turns a bearer token into the caller (the auth use case).
type TokenResolver interface {
	ResolveToken(ctx context.Context, token string) (*domain.Actor, error)
}

// PartnerLookup finds a partner by its publishable key, and lists every allowed origin.
type PartnerLookup interface {
	GetByPublishableKey(ctx context.Context, key string) (*domain.Partner, error)
	ListAllowedOrigins(ctx context.Context) ([]string, error)
}

// OriginPolicy: which browser origins may call the widget API. Besides each partner's
// allowed_origins, development also allows the tunnel suffix (e.g. .trycloudflare.com) and
// extra origins such as a phone on the local network (http://192.168.1.20:5173).
type OriginPolicy struct {
	Dev       bool
	DevSuffix string   // DEV_ALLOWED_ORIGIN_SUFFIX
	Extra     []string // EXTRA_ALLOWED_ORIGINS (development only)
}

func (p OriginPolicy) devAllows(origin string) bool {
	if !p.Dev {
		return false
	}
	if p.DevSuffix != "" && strings.HasSuffix(origin, p.DevSuffix) && strings.HasPrefix(origin, "https://") {
		return true
	}
	for _, o := range p.Extra {
		if o == origin {
			return true
		}
	}
	return false
}

// ---- Partner key ----

// PartnerKeyMiddleware reads X-Partner-Key, finds the partner (401 if unknown) and checks that
// the browser's Origin is one of the partner's allowed origins (403 otherwise). Requests
// without an Origin header (curl, a server) are not browser calls and pass the origin check.
func PartnerKeyMiddleware(partners PartnerLookup, policy OriginPolicy) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := strings.TrimSpace(c.GetHeader("X-Partner-Key"))
		if key == "" {
			abort(c, http.StatusUnauthorized, "partner_key_missing", "X-Partner-Key header is missing")
			return
		}
		partner, err := partners.GetByPublishableKey(c.Request.Context(), key)
		if errors.Is(err, domain.ErrNotFound) {
			abort(c, http.StatusUnauthorized, "partner_key_invalid", "Unknown partner key")
			return
		}
		if err != nil {
			log.Print("error : partner key lookup: ", err)
			abort(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
			return
		}
		if origin := c.GetHeader("Origin"); origin != "" && !contains(partner.AllowedOrigins, origin) && !policy.devAllows(origin) {
			abort(c, http.StatusForbidden, "origin_not_allowed", "This website may not use this partner key")
			return
		}
		SetActor(c, domain.Actor{Kind: domain.ActorAnonymous, PartnerID: partner.ID})
		c.Next()
	}
}

// ---- Tokens ----

func bearer(c *gin.Context) string {
	h := c.GetHeader("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "Bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

// tokenMiddleware checks "Authorization: Bearer <prefix>…" and sets the actor of that kind.
func tokenMiddleware(auth TokenResolver, prefix string, kind domain.ActorKind) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := bearer(c)
		if !strings.HasPrefix(token, prefix) {
			abort(c, http.StatusUnauthorized, "unauthorized", "Sign-in needed")
			return
		}
		actor, err := auth.ResolveToken(c.Request.Context(), token)
		if errors.Is(err, domain.ErrUnauthorized) || (err == nil && actor.Kind != kind) {
			abort(c, http.StatusUnauthorized, "unauthorized", "Sign-in needed")
			return
		}
		if err != nil {
			log.Print("error : resolve token: ", err)
			abort(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
			return
		}
		// Behind PartnerKeyMiddleware: the learner must belong to the partner whose key was sent.
		if kind == domain.ActorLearner {
			if keyPartner := ActorFrom(c).PartnerID; keyPartner != uuid.Nil && keyPartner != actor.PartnerID {
				abort(c, http.StatusForbidden, "forbidden", "This sign-up belongs to another partner")
				return
			}
		}
		SetActor(c, *actor)
		c.Next()
	}
}

// LearnerAuthMiddleware checks "Authorization: Bearer lt_..." and sets the learner Actor.
func LearnerAuthMiddleware(auth TokenResolver) gin.HandlerFunc {
	return tokenMiddleware(auth, "lt_", domain.ActorLearner)
}

// StaffAuthMiddleware checks "Authorization: Bearer st_..." and sets the staff Actor.
func StaffAuthMiddleware(auth TokenResolver) gin.HandlerFunc {
	return tokenMiddleware(auth, "st_", domain.ActorStaff)
}

// PartnerServerAuthMiddleware checks "Authorization: Bearer pt_..." (OAuth client credentials token).
func PartnerServerAuthMiddleware(auth TokenResolver) gin.HandlerFunc {
	return tokenMiddleware(auth, "pt_", domain.ActorPartnerServer)
}

// RequireRole lets the request through only if the staff Actor has one of the roles.
func RequireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor := ActorFrom(c)
		if actor.IsAnonymous() {
			abort(c, http.StatusUnauthorized, "unauthorized", "Sign-in needed")
			return
		}
		if actor.Kind != domain.ActorStaff || !contains(roles, actor.Role) {
			abort(c, http.StatusForbidden, "forbidden", "Not allowed")
			return
		}
		c.Next()
	}
}

// RequireScope lets the request through only if the partner-server token has the scope.
func RequireScope(scope string) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor := ActorFrom(c)
		if actor.IsAnonymous() {
			abort(c, http.StatusUnauthorized, "unauthorized", "Sign-in needed")
			return
		}
		if actor.Kind != domain.ActorPartnerServer || !contains(actor.Scopes, scope) {
			abort(c, http.StatusForbidden, "insufficient_scope", "Not allowed")
			return
		}
		c.Next()
	}
}

// ---- CORS ----

// CORSMiddleware allows browser calls only from origins in partners.allowed_origins (refreshed
// every 2 minutes) or allowed by the development policy, and answers OPTIONS preflights.
func CORSMiddleware(partners PartnerLookup, policy OriginPolicy) gin.HandlerFunc {
	var (
		mu       sync.Mutex
		allowed  map[string]bool
		loadedAt time.Time
	)
	isAllowed := func(ctx context.Context, origin string) bool {
		if policy.devAllows(origin) {
			return true
		}
		mu.Lock()
		defer mu.Unlock()
		if allowed == nil || time.Since(loadedAt) > 2*time.Minute {
			origins, err := partners.ListAllowedOrigins(ctx)
			if err != nil {
				log.Print("error : load allowed origins: ", err)
				return allowed[origin] // keep the last good list
			}
			allowed = make(map[string]bool, len(origins))
			for _, o := range origins {
				allowed[o] = true
			}
			loadedAt = time.Now()
		}
		return allowed[origin]
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin == "" {
			c.Next()
			return
		}
		ok := isAllowed(c.Request.Context(), origin)
		if ok {
			h := c.Writer.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Add("Vary", "Origin")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Partner-Key")
			h.Set("Access-Control-Max-Age", "600")
		}
		if c.Request.Method == http.MethodOptions {
			if ok {
				c.AbortWithStatus(http.StatusNoContent)
			} else {
				c.AbortWithStatus(http.StatusForbidden)
			}
			return
		}
		c.Next()
	}
}

// ---- Telegram ----

// TelegramSecretMiddleware checks Telegram's X-Telegram-Bot-Api-Secret-Token header against
// TELEGRAM_WEBHOOK_SECRET. Without a secret, the webhook only works in development.
func TelegramSecretMiddleware(secret string, dev bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		if secret == "" {
			if !dev {
				abort(c, http.StatusNotFound, "not_found", "Not found")
				return
			}
			c.Next()
			return
		}
		got := c.GetHeader("X-Telegram-Bot-Api-Secret-Token")
		if subtle.ConstantTimeCompare([]byte(got), []byte(secret)) != 1 {
			abort(c, http.StatusUnauthorized, "unauthorized", "Bad webhook secret")
			return
		}
		c.Next()
	}
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}
