package main

import (
	"log"

	controllers "bridge/Delivery/Controllers"
	routers "bridge/Delivery/Routers"
	infrastructure "bridge/Infrastructure"
	repository "bridge/Repository"
	usecase "bridge/Usecase"
)

func main() {
	// Initialize dependencies
	db := repository.InitializeDB()

	// Infrastructure services (outside world: tokens/encryption, speech-to-text, SMS)
	security := infrastructure.InitSecurityService()
	speech := infrastructure.InitSpeechService()
	messages := infrastructure.InitMessageService()
	_ = messages // TODO: pass to the resume-link / consent-code use cases (Should)

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
	registrationUsecase := usecase.NewRegistrationUsecase(learnerRepo, registrationRepo, sessionRepo, security)
	supportUsecase := usecase.NewSupportUsecase(supportRepo, security)
	consentUsecase := usecase.NewConsentUsecase(consentRepo)
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

	// Router
	router := routers.SetupRouter(ctrls)

	// Run the app (gin reads the PORT environment variable, default 8080)
	if err := router.Run(); err != nil {
		log.Fatal("server stopped: ", err)
	}
}
