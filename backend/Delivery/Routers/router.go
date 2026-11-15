package routers

import (
	"net/http"
	"os"

	controllers "bridge/Delivery/Controllers"
	infrastructure "bridge/Infrastructure"

	"github.com/gin-gonic/gin"
)

// Controllers groups every controller so SetupRouter keeps a short signature.
type Controllers struct {
	Config       *controllers.ConfigController
	Registration *controllers.RegistrationController
	Support      *controllers.SupportController
	Consent      *controllers.ConsentController
	Auth         *controllers.AuthController
	Speech       *controllers.SpeechController
	Job          *controllers.JobController
	Application  *controllers.ApplicationController
	Learner      *controllers.LearnerController

	// Round 3. Left nil (as in the router tests), their routes answer 501.
	Me                  *controllers.MeController
	Referral            *controllers.ReferralController
	EmployerApplication *controllers.EmployerApplicationController
}

// Middlewares groups the middleware set up in main.go. A nil handler lets requests through
// (the router tests build the router without sign-in).
type Middlewares struct {
	IPLimiter     *infrastructure.IPRateLimiter     // per client IP, every request
	GlobalLimiter *infrastructure.GlobalRateLimiter // whole server
	StrictLimiter *infrastructure.IPRateLimiter     // per IP: sign-in, OAuth, new registrations, resume

	CORS              gin.HandlerFunc
	PartnerKey        gin.HandlerFunc // X-Partner-Key + allowed origin
	LearnerAuth       gin.HandlerFunc // Bearer lt_…
	StaffAuth         gin.HandlerFunc // Bearer st_…
	PartnerServerAuth gin.HandlerFunc // Bearer pt_…
	TelegramSecret    gin.HandlerFunc

	DevRoutes bool // APP_ENV=dev: /api/v1/dev/messages
}

func orPass(h gin.HandlerFunc) gin.HandlerFunc {
	if h == nil {
		return func(c *gin.Context) { c.Next() }
	}
	return h
}

func (m *Middlewares) strict() gin.HandlerFunc {
	if m.StrictLimiter == nil {
		return orPass(nil)
	}
	return m.StrictLimiter.Middleware()
}

// SetupRouter registers every route and returns the engine; main.go runs it.
// (Returning the engine instead of calling Run here lets tests call the routes.)
func SetupRouter(ctrl *Controllers, mw *Middlewares) *gin.Engine {
	router := gin.Default() // includes the logger and panic recovery
	// A missing or extra "/" must not turn a POST into a redirect the widget can't follow.
	router.RedirectTrailingSlash = false

	router.Use(mw.GlobalLimiter.Middleware(), mw.IPLimiter.Middleware())
	router.Use(orPass(mw.CORS))

	// Liveness check for Docker
	healthHandler := func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	}
	router.GET("/health", healthHandler)

	// OpenAPI 3 spec and interactive documentation
	openapiHandler := func(c *gin.Context) {
		candidates := []string{
			"../../../api/openapi.yaml",
			"../../api/openapi.yaml",
			"../api/openapi.yaml",
			"api/openapi.yaml",
			"./api/openapi.yaml",
		}
		for _, path := range candidates {
			if data, err := os.ReadFile(path); err == nil {
				c.Data(http.StatusOK, "application/yaml; charset=utf-8", data)
				return
			}
		}
		c.String(http.StatusNotFound, "openapi.yaml not found")
	}

	router.GET("/api/openapi.yaml", openapiHandler)
	router.GET("/openapi.yaml", openapiHandler)

	docsHandler := func(c *gin.Context) {
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(http.StatusOK, swaggerUIHTML)
	}
	router.GET("/api/docs", docsHandler)
	router.GET("/docs", docsHandler)

	v1 := router.Group("/api/v1")
	partnerKey, learnerAuth, staffAuth := orPass(mw.PartnerKey), orPass(mw.LearnerAuth), orPass(mw.StaffAuth)

	// Public: no key, no token
	v1.GET("/jobs/:id/jobposting.jsonld", ctrl.Job.GetJobPostingController)
	v1.POST("/auth/staff/login", mw.strict(), ctrl.Auth.StaffLoginController)
	v1.POST("/oauth/token", mw.strict(), ctrl.Auth.OAuthTokenController)
	v1.POST("/auth/logout", ctrl.Auth.LogoutController) // learner or staff token, checked by the use case
	v1.POST("/telegram/webhook", orPass(mw.TelegramSecret), ctrl.Registration.TelegramWebhookController)

	// Widget routes: partner key only
	widget := v1.Group("", partnerKey)
	{
		widget.GET("/config", ctrl.Config.GetConfigController)
		widget.POST("/registrations", mw.strict(), ctrl.Registration.CreateRegistrationController)
		widget.GET("/jobs", ctrl.Job.ListJobsController)
		widget.GET("/jobs/:id", ctrl.Job.GetJobController)
		widget.POST("/resume/lookup", mw.strict(), ctrl.Registration.ResumeLookupController)
		widget.POST("/resume/verify", mw.strict(), ctrl.Registration.ResumeVerifyController)
		widget.POST("/speech/synthesis", ctrl.Speech.SynthesizeController) // read aloud, fixed text only
	}

	// Learner routes: partner key + learner token
	learner := v1.Group("", partnerKey, learnerAuth)
	{
		learner.GET("/registrations/:id", ctrl.Registration.GetRegistrationController)
		learner.PATCH("/registrations/:id", ctrl.Registration.UpdateProgressController)
		learner.PUT("/registrations/:id/answers/:questionId", ctrl.Registration.SaveAnswerController)
		learner.PUT("/registrations/:id/support-request", ctrl.Support.SaveSupportRequestController)
		learner.POST("/registrations/:id/consents", ctrl.Consent.CreateConsentController)
		learner.POST("/registrations/:id/resume-links", ctrl.Registration.CreateResumeLinkController)
		learner.POST("/registrations/:id/submit", ctrl.Registration.SubmitRegistrationController)
		learner.POST("/speech/transcriptions", ctrl.Speech.TranscribeController)
		learner.POST("/jobs/:id/applications", ctrl.Application.CreateApplicationController)
		learner.GET("/me", ctrl.Me.GetMeController)
		learner.PATCH("/me", ctrl.Me.UpdateMeController)
		learner.DELETE("/me", ctrl.Me.DeleteMeController)
	}

	// Staff routes: staff token
	staff := v1.Group("", staffAuth)
	{
		staff.GET("/auth/staff/me", ctrl.Auth.StaffMeController)

		employer := staff.Group("/employer", infrastructure.RequireRole("employer"))
		{
			employer.GET("/jobs", ctrl.Job.ListEmployerJobsController)
			employer.POST("/jobs", ctrl.Job.CreateEmployerJobController)
			employer.POST("/jobs/:id/publish", ctrl.Job.PublishEmployerJobController)
			employer.GET("/jobs/:id/applications", ctrl.EmployerApplication.ListJobApplicationsController)
		}

		partnerStaff := staff.Group("/partner", infrastructure.RequireRole("partner_staff"))
		{
			partnerStaff.POST("/registrations/:id/consent-code", ctrl.Registration.SendConsentCodeController)
			partnerStaff.GET("/referrals", ctrl.Referral.ListPartnerReferralsController)
			partnerStaff.PATCH("/referrals/:id", ctrl.Referral.UpdatePartnerReferralController)
		}
	}

	// Partner-server routes (Level 2 API): OAuth client-credentials token with a scope
	partnerAPI := v1.Group("/partner-api", orPass(mw.PartnerServerAuth), infrastructure.RequireScope("learners:read"))
	{
		partnerAPI.GET("/learners", ctrl.Learner.ListPartnerLearnersController)
		partnerAPI.GET("/learners/:id", ctrl.Learner.GetPartnerLearnerController)
	}

	// Development only: the simulated SMS / Telegram inbox (resume codes, consent codes).
	if mw.DevRoutes {
		v1.GET("/dev/messages", ctrl.Registration.DevMessagesController)
	}

	// Should endpoints still to build (see TECHNICAL_PLAN_LITE.md): learner phone-code sign-in,
	// downloading /me, the rest of the partner staff routes (E1), /support/requests,
	// JobPosting import and feed.

	return router
}

const swaggerUIHTML = `<!DOCTYPE html>
<html>
<head>
  <title>Bridge Onboarding API Documentation</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: '/api/openapi.yaml',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ]
      });
    };
  </script>
</body>
</html>`
