package infrastructure

import (
	domain "bridge/Domain"

	"github.com/gin-gonic/gin"
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

// SKELETON: every middleware below lets all requests through without setting an actor,
// so the endpoints behind them answer 401 until they are built (Dev B: B1, B2).
// When one is built it must call SetActor, for example:
//   - PartnerKeyMiddleware: SetActor(c, domain.Actor{Kind: domain.ActorAnonymous, PartnerID: partner.ID})
//   - LearnerAuthMiddleware: SetActor(c, domain.Actor{Kind: domain.ActorLearner, ID: learnerID, PartnerID: partnerID})
//   - StaffAuthMiddleware: SetActor(c, domain.Actor{Kind: domain.ActorStaff, ID: staffID, Role: role, EmployerID: employerID})

// CORSMiddleware allows only the web addresses (origins) in partners.allowed_origins.
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: check the Origin header against partner origins; answer OPTIONS preflight requests.
		c.Next()
	}
}

// PartnerKeyMiddleware reads X-Partner-Key, finds the partner and puts it in the context.
func PartnerKeyMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: look up the key; 401 if unknown; 403 if the Origin isn't allowed for that partner.
		c.Next()
	}
}

// LearnerAuthMiddleware checks "Authorization: Bearer lt_..." and sets the learner Actor.
func LearnerAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: hash the token, find the session, reject expired or revoked ones.
		c.Next()
	}
}

// StaffAuthMiddleware checks "Authorization: Bearer st_..." and sets the staff Actor.
func StaffAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: same as LearnerAuthMiddleware, for staff sessions.
		c.Next()
	}
}

// PartnerServerAuthMiddleware checks "Authorization: Bearer pt_..." (OAuth client credentials token).
func PartnerServerAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: same as LearnerAuthMiddleware, for partner-server sessions.
		c.Next()
	}
}

// RequireRole lets the request through only if the staff Actor has one of the roles.
func RequireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: 403 if the Actor's role is not in roles.
		c.Next()
	}
}

// RequireScope lets the request through only if the partner-server token has the scope.
func RequireScope(scope string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: 403 if the scope is missing.
		c.Next()
	}
}
