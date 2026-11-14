package routers

import (
	"net/http"

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

// SetupRouter registers every route and returns the engine; main.go runs it.
// (Returning the engine instead of calling Run here lets tests call the routes.)
func SetupRouter(ctrl *Controllers) *gin.Engine {
	router := gin.Default()
	router.Use(infrastructure.CORSMiddleware())

	// Liveness check for Docker
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	// TODO: serve ../api/openapi.yaml at /api/openapi.yaml and Swagger UI at /api/docs

	v1 := router.Group("/api/v1")

	// Public: no key, no token
	v1.GET("/jobs/:id/jobposting.jsonld", ctrl.Job.GetJobPostingController)
	v1.POST("/auth/staff/login", ctrl.Auth.StaffLoginController)
	v1.POST("/oauth/token", ctrl.Auth.OAuthTokenController)
	v1.POST("/auth/logout", ctrl.Auth.LogoutController) // TODO: accept a learner or a staff token

	// Widget routes: partner key only
	widget := v1.Group("", infrastructure.PartnerKeyMiddleware())
	{
		widget.GET("/config", ctrl.Config.GetConfigController)
		widget.POST("/registrations", ctrl.Registration.CreateRegistrationController)
		widget.GET("/jobs", ctrl.Job.ListJobsController)
		widget.GET("/jobs/:id", ctrl.Job.GetJobController)
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
