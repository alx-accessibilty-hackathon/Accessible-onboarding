package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	config "bridge/Config"
	controllers "bridge/Delivery/Controllers"
	routers "bridge/Delivery/Routers"
	infrastructure "bridge/Infrastructure"
	repository "bridge/Repository"
	usecase "bridge/Usecase"
	"bridge/migrations"

	_ "github.com/jackc/pgx/v5/stdlib" // database/sql driver "pgx", for goose
	"github.com/pressly/goose/v3"
)

// Usage:
//
//	bridge            run the API (same as `bridge serve`)
//	bridge migrate    apply every database migration (embedded in the binary)
//	bridge seed       add the demo data; `--if-empty` does nothing if it is already there
//	bridge tts-clear  empty the read-aloud clip cache (database table tts_cache and TTS_CACHE_DIR)
func main() {
	// Configuration: the only place environment variables are read
	cfg, err := config.Load()
	if err != nil {
		log.Fatal("configuration error: ", err)
	}

	cmd := "serve"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	switch cmd {
	case "serve":
		serve(cfg)
	case "migrate":
		migrate(cfg)
	case "seed":
		seed(cfg, os.Args[2:])
	case "tts-clear":
		ttsClear(cfg)
	default:
		log.Fatalf("unknown command %q: use serve, migrate, seed or tts-clear", cmd)
	}
}

// ttsClear empties the read-aloud clip cache: the database table tts_cache and the files in
// TTS_CACHE_DIR. Each clip is made again (once) the next time someone hears it. Use it after
// changing the voice or how texts are prepared for it. Restart the running API too (its memory
// copy).
func ttsClear(cfg config.Config) {
	db := repository.InitializeDB(cfg.DatabaseURL)
	defer db.Close()
	n, err := repository.NewTTSCacheRepo(db).Clear(context.Background())
	if err != nil {
		log.Fatal("tts-clear: database: ", err)
	}
	fmt.Printf("Read-aloud cache cleared: %d clips deleted from the database (tts_cache)\n", n)
	if cfg.TTSCacheDir != "" {
		// Only what the cache wrote: the provider folders and loose .mp3 clips, nothing else.
		removed := 0
		for _, provider := range []string{"addis", "azure"} {
			dir := filepath.Join(cfg.TTSCacheDir, provider)
			if _, err := os.Stat(dir); err == nil {
				if err := os.RemoveAll(dir); err != nil {
					log.Fatal("tts-clear: ", err)
				}
				removed++
			}
		}
		clips, _ := filepath.Glob(filepath.Join(cfg.TTSCacheDir, "*.mp3"))
		for _, f := range clips {
			if err := os.Remove(f); err == nil {
				removed++
			}
		}
		fmt.Printf("Read-aloud cache folder cleared: %s (%d entries removed)\n", cfg.TTSCacheDir, removed)
	}
	fmt.Println("Restart the API so it forgets the clips it keeps in memory.")
}

func migrate(cfg config.Config) {
	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		log.Fatal("open database: ", err)
	}
	defer db.Close()
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		log.Fatal(err)
	}
	if err := goose.Up(db, "."); err != nil {
		log.Fatal("migrate: ", err)
	}
	log.Println("migrations applied")
}

func seed(cfg config.Config, args []string) {
	fs := flag.NewFlagSet("seed", flag.ExitOnError)
	ifEmpty := fs.Bool("if-empty", false, "do nothing if demo data already exists")
	_ = fs.Parse(args)

	db := repository.InitializeDB(cfg.DatabaseURL)
	defer db.Close()
	security := infrastructure.InitSecurityService(cfg.DataEncryptionKey, cfg.CodeHashKey)

	password, generatedPassword := orRandom(cfg.SeedStaffPassword)
	secret, generatedSecret := orRandom(cfg.SeedClientSecret)
	res, err := repository.Seed(context.Background(), db, repository.SeedOptions{
		IfEmpty:       *ifEmpty,
		StaffPassword: password,
		ClientSecret:  secret,
		HashPassword:  security.HashPassword,
		HashSecret:    security.HashToken,
		Origins:       repository.DemoOrigins,
	})
	if err != nil {
		log.Fatal("seed: ", err)
	}
	if res.Skipped {
		log.Println("seed: demo data already present, nothing to do")
		return
	}

	fmt.Println("Demo data added:")
	fmt.Println("  partner keys:   pk_demo_savanna, pk_demo_jobboard (platforms), pk_demo_aaapd (AAAPD, referral organisation)")
	fmt.Println("  staff accounts: employer@example.org, staff@aaapd.example, staff@savanna.example, support@example.org, admin@example.org")
	if generatedPassword {
		fmt.Println("  staff password: " + password + "   (random: set SEED_STAFF_PASSWORD to choose one)")
	} else {
		fmt.Println("  staff password: from SEED_STAFF_PASSWORD")
	}
	fmt.Println("  OAuth client:   savanna-demo")
	if generatedSecret {
		fmt.Println("  client secret:  " + secret + "   (random: set SEED_CLIENT_SECRET to choose one)")
	} else {
		fmt.Println("  client secret:  from SEED_CLIENT_SECRET")
	}
	fmt.Printf("  demo jobs:      %d (employer Example Co)\n", res.Jobs)
}

// orRandom returns v, or a random value (and true) when v is empty.
func orRandom(v string) (string, bool) {
	if v != "" {
		return v, false
	}
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		log.Fatal(err)
	}
	return base64.RawURLEncoding.EncodeToString(b), true
}

func serve(cfg config.Config) {
	// Links built from PUBLIC_WEB_URL (JobPosting JSON-LD, resume links) must be public.
	if problem := cfg.PublicWebURLProblem(); problem != "" {
		log.Printf("WARNING: %s", problem)
	}

	// Initialize dependencies
	db := repository.InitializeDB(cfg.DatabaseURL)

	// Infrastructure services (outside world: tokens/encryption, speech-to-text, SMS)
	security := infrastructure.InitSecurityService(cfg.DataEncryptionKey, cfg.CodeHashKey)
	speech := infrastructure.InitSpeechService(cfg.STTProviders, cfg.STTTimeout)
	speech.SetAzure(cfg.AzureSpeechKey, cfg.AzureSpeechRegion)
	speech.SetLocalURL(cfg.LocalSTTURL)
	// Read aloud: Addis AI for Amharic (one fixed voice), cached in RAM, on disk and in the
	// database (tts_cache), so each clip is paid for once, whatever device asks again.
	speech.SetAddisAI(cfg.AddisAIAPIKey, cfg.AddisAIVoiceID, cfg.AddisAISpeed)
	speech.SetCacheDir(cfg.TTSCacheDir)
	speech.SetTTSStore(repository.NewTTSCacheRepo(db))
	speech.SetTTSDailyLimit(cfg.TTSDailyLimit)
	log.Printf("read aloud (server voice): %s", speech.TTSSummary())
	go func() {
		// Lists Addis AI's Amharic voices (free) and warns if ADDIS_AI_VOICE_ID isn't one of them.
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		speech.LogAddisVoices(ctx, "am")
	}()
	messages := infrastructure.InitMessageService(cfg.SMSProvider)

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
	profileRepo := repository.NewProfileRepo(db)
	referralRepo := repository.NewReferralRepo(db)
	auditRepo := repository.NewAuditRepo(db)

	// Use cases
	configUsecase := usecase.NewConfigUsecase(partnerRepo, speech)
	authUsecase := usecase.NewAuthUsecase(sessionRepo, staffRepo, partnerRepo, learnerRepo, security)
	// authUsecase is the SessionIssuer: it creates the learner token when a sign-up starts.
	registrationUsecase := usecase.NewRegistrationUsecase(learnerRepo, registrationRepo, supportRepo, partnerRepo, authUsecase, flows, sessionRepo, security, messages)
	registrationUsecase.PublicURL = cfg.PublicWebURL
	supportUsecase := usecase.NewSupportUsecase(supportRepo, registrationRepo, flows, security)
	consentUsecase := usecase.NewConsentUsecase(consentRepo, registrationRepo)
	speechUsecase := usecase.NewSpeechUsecase(consentRepo, speech)
	jobUsecase := usecase.NewJobUsecase(jobRepo, flows, cfg.PublicWebURL)
	applicationUsecase := usecase.NewApplicationUsecase(applicationRepo, jobRepo, learnerRepo)
	learnerUsecase := usecase.NewLearnerUsecase(learnerRepo)
	meUsecase := usecase.NewMeUsecase(learnerRepo, profileRepo, partnerRepo, registrationRepo, consentRepo, flows, security)
	referralUsecase := usecase.NewReferralUsecase(referralRepo)
	employerApplicationUsecase := usecase.NewEmployerApplicationUsecase(jobRepo, applicationRepo, auditRepo, security)

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

		Me:                  controllers.NewMeController(meUsecase),
		Referral:            controllers.NewReferralController(referralUsecase),
		EmployerApplication: controllers.NewEmployerApplicationController(employerApplicationUsecase),
	}

	// Middleware
	origins := infrastructure.OriginPolicy{Dev: cfg.IsDev(), DevSuffix: cfg.DevAllowedOriginSuffix, Extra: cfg.ExtraAllowedOrigins}
	mw := &routers.Middlewares{
		IPLimiter:         infrastructure.NewIPRateLimiter(120, time.Minute),         // 120 requests per minute per IP
		GlobalLimiter:     infrastructure.NewGlobalRateLimiter(1000, 10*time.Second), // 1000 requests per 10 seconds
		StrictLimiter:     infrastructure.NewIPRateLimiter(20, time.Minute),          // sign-in, OAuth, new sign-ups, resume
		CORS:              infrastructure.CORSMiddleware(partnerRepo, origins),
		PartnerKey:        infrastructure.PartnerKeyMiddleware(partnerRepo, origins),
		LearnerAuth:       infrastructure.LearnerAuthMiddleware(authUsecase),
		StaffAuth:         infrastructure.StaffAuthMiddleware(authUsecase),
		PartnerServerAuth: infrastructure.PartnerServerAuthMiddleware(authUsecase),
		TelegramSecret:    infrastructure.TelegramSecretMiddleware(cfg.TelegramWebhookSecret, cfg.IsDev()),
		DevRoutes:         cfg.IsDev(),
	}

	// Router
	router := routers.SetupRouter(ctrls, mw)

	// Run the app
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatal("server stopped: ", err)
	}
}
