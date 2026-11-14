package infrastructure

import "github.com/gin-gonic/gin"

// SKELETON: every middleware below lets all requests through.
// Each one must be implemented before the endpoints it protects go live.

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
