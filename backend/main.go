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
	speech.SetAzure(cfg.AzureSpeechKey, cfg.AzureSpeechRegion)
	speech.SetLocalURL(cfg.LocalSTTURL)
	messages := infrastructure.InitMessageService(cfg.SMSProvider)

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
	configUsecase := usecase.NewConfigUsecase(partnerRepo, speech)
	registrationUsecase := usecase.NewRegistrationUsecase(learnerRepo, registrationRepo, sessionRepo, security, messages)
	supportUsecase := usecase.NewSupportUsecase(supportRepo, security)
	consentUsecase := usecase.NewConsentUsecase(consentRepo, registrationRepo)
	authUsecase := usecase.NewAuthUsecase(sessionRepo, staffRepo, partnerRepo, security)
	speechUsecase := usecase.NewSpeechUsecase(consentRepo, speech)
	jobUsecase := usecase.NewJobUsecase(jobRepo)
	applicationUsecase := usecase.NewApplicationUsecase(applicationRepo, jobRepo)
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
