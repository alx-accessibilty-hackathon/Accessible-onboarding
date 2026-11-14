package main

import (
	"log"
	"time"

	config "bridge/Config"
	controllers "bridge/Delivery/Controllers"
	routers "bridge/Delivery/Routers"
	infrastructure "bridge/Infrastructure"
	repository "bridge/Repository"
	usecase "bridge/Usecase"
)

func main() {
	// Configuration: the only place environment variables are read
	cfg, err := config.Load()
	if err != nil {
		log.Fatal("configuration error: ", err)
	}

	// Initialize dependencies
	db := repository.InitializeDB(cfg.DatabaseURL)

	// Infrastructure services (outside world: tokens/encryption, speech-to-text, SMS)
	security := infrastructure.InitSecurityService(cfg.DataEncryptionKey, cfg.CodeHashKey)
	speech := infrastructure.InitSpeechService(cfg.STTProviders, cfg.STTTimeout)
	messages := infrastructure.InitMessageService(cfg.SMSProvider)
	_ = messages // TODO: pass to the resume-link / consent-code use cases (Should)

	// Flow files and the needs vocabulary, shared with the frontend. A broken file stops the server.
	flows, err := infrastructure.LoadFlowStore(cfg.FlowsDir, cfg.NeedsFile)
	if err != nil {
		log.Fatal("flow files: ", err)
	}

	// Repositories
	partnerRepo := repository.NewPartnerRepo(db)
	staffRepo := repository.NewStaffRepo(db)
	learnerRepo := repository.NewLearnerRepo(db)
	registrationRepo := repository.NewRegistrationRepo(db)
	supportRepo := repository.NewSupportRepo(db)
	consentRepo := repository.NewConsentRepo(db)
	sessionRepo := repository.NewSessionRepo(db)
	jobRepo := repository.NewJobRepo(db)
	applicationRepo := repository.NewApplicationRepo(db)

	// Use cases
	configUsecase := usecase.NewConfigUsecase(partnerRepo)
	authUsecase := usecase.NewAuthUsecase(sessionRepo, staffRepo, partnerRepo, security)
	// authUsecase is the SessionIssuer: it creates the learner token when a sign-up starts.
	registrationUsecase := usecase.NewRegistrationUsecase(learnerRepo, registrationRepo, supportRepo, partnerRepo, authUsecase, flows)
	supportUsecase := usecase.NewSupportUsecase(supportRepo, registrationRepo, flows, security)
	consentUsecase := usecase.NewConsentUsecase(consentRepo)
	speechUsecase := usecase.NewSpeechUsecase(consentRepo, speech)
	jobUsecase := usecase.NewJobUsecase(jobRepo, flows, cfg.PublicWebURL)
	applicationUsecase := usecase.NewApplicationUsecase(applicationRepo, jobRepo, learnerRepo)
	learnerUsecase := usecase.NewLearnerUsecase(learnerRepo)

	// Controllers
	ctrls := &routers.Controllers{
		Config:       controllers.NewConfigController(configUsecase),
		Registration: controllers.NewRegistrationController(registrationUsecase),
		Support:      controllers.NewSupportController(supportUsecase),
		Consent:      controllers.NewConsentController(consentUsecase),
		Auth:         controllers.NewAuthController(authUsecase),
		Speech:       controllers.NewSpeechController(speechUsecase),
		Job:          controllers.NewJobController(jobUsecase),
		Application:  controllers.NewApplicationController(applicationUsecase),
		Learner:      controllers.NewLearnerController(learnerUsecase),
	}

	// Middleware
	mw := &routers.Middlewares{
		IPLimiter:     infrastructure.NewIPRateLimiter(120, time.Minute),         // 120 requests per minute per IP
		GlobalLimiter: infrastructure.NewGlobalRateLimiter(1000, 10*time.Second), // 1000 requests per 10 seconds
	}

	// Router
	router := routers.SetupRouter(ctrls, mw)

	// Run the app
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatal("server stopped: ", err)
	}
}
