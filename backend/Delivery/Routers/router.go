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
}

// Middlewares groups the middleware that needs setting up in main.go (rate limiters now;
// the sign-in middlewares join here once the auth use case exists).
type Middlewares struct {
	IPLimiter     *infrastructure.IPRateLimiter     // per client IP
	GlobalLimiter *infrastructure.GlobalRateLimiter // whole server
}

// SetupRouter registers every route and returns the engine; main.go runs it.
// (Returning the engine instead of calling Run here lets tests call the routes.)
func SetupRouter(ctrl *Controllers, mw *Middlewares) *gin.Engine {
	router := gin.Default() // includes the logger and panic recovery
	// A missing or extra "/" must not turn a POST into a redirect the widget can't follow.
	router.RedirectTrailingSlash = false

	router.Use(mw.GlobalLimiter.Middleware(), mw.IPLimiter.Middleware())
	router.Use(infrastructure.CORSMiddleware())

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

	// Public: no key, no token
	v1.GET("/jobs/:id/jobposting.jsonld", ctrl.Job.GetJobPostingController)
	v1.POST("/auth/staff/login", ctrl.Auth.StaffLoginController)
	v1.POST("/oauth/token", ctrl.Auth.OAuthTokenController)
	v1.POST("/auth/logout", ctrl.Auth.LogoutController) // TODO: accept a learner or a staff token
	v1.POST("/telegram/webhook", ctrl.Registration.TelegramWebhookController)

	// Widget routes: partner key only
	widget := v1.Group("", infrastructure.PartnerKeyMiddleware())
	{
		widget.GET("/config", ctrl.Config.GetConfigController)
		widget.POST("/registrations", ctrl.Registration.CreateRegistrationController)
		widget.GET("/jobs", ctrl.Job.ListJobsController)
		widget.GET("/jobs/:id", ctrl.Job.GetJobController)
		widget.POST("/resume/lookup", ctrl.Registration.ResumeLookupController)
		widget.POST("/resume/verify", ctrl.Registration.ResumeVerifyController)
	}

	// Learner routes: partner key + learner token
	learner := v1.Group("", infrastructure.PartnerKeyMiddleware(), infrastructure.LearnerAuthMiddleware())
	{
		learner.GET("/registrations/:id", ctrl.Registration.GetRegistrationController)
		learner.PATCH("/registrations/:id", ctrl.Registration.UpdateProgressController)
		learner.PUT("/registrations/:id/answers/:questionId", ctrl.Registration.SaveAnswerController)
		learner.PUT("/registrations/:id/support-request", ctrl.Support.SaveSupportRequestController)
		learner.POST("/registrations/:id/consents", ctrl.Consent.CreateConsentController)
		learner.POST("/registrations/:id/submit", ctrl.Registration.SubmitRegistrationController)
		learner.POST("/speech/transcriptions", ctrl.Speech.TranscribeController)
		learner.POST("/jobs/:id/applications", ctrl.Application.CreateApplicationController)
	}

	// Staff routes: staff token
	staff := v1.Group("", infrastructure.StaffAuthMiddleware())
	{
		staff.GET("/auth/staff/me", ctrl.Auth.StaffMeController)

		employer := staff.Group("/employer", infrastructure.RequireRole("employer"))
		{
			employer.GET("/jobs", ctrl.Job.ListEmployerJobsController)
			employer.POST("/jobs", ctrl.Job.CreateEmployerJobController)
			employer.POST("/jobs/:id/publish", ctrl.Job.PublishEmployerJobController)
		}

		partnerStaff := staff.Group("/partner")
		{
			partnerStaff.POST("/registrations/:id/consent-code", ctrl.Registration.SendConsentCodeController)
		}
	}

	// Partner-server routes (Level 2 API): OAuth client-credentials token with a scope
	partnerAPI := v1.Group("/partner-api", infrastructure.PartnerServerAuthMiddleware(), infrastructure.RequireScope("learners:read"))
	{
		partnerAPI.GET("/learners", ctrl.Learner.ListPartnerLearnersController)
		partnerAPI.GET("/learners/:id", ctrl.Learner.GetPartnerLearnerController)
	}

	// Should endpoints (add when the Musts are done; see TECHNICAL_PLAN_LITE.md):
	// resume links and lookup/verify, learner phone-code sign-in, /dev/messages,
	// /me (see, download, delete), partner staff routes (E1), /support/requests,
	// employer applications, JobPosting import and feed.

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
