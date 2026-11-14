package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds every setting the API reads from the environment, loaded once in main.go
// and passed to the parts that need it. Nothing else reads environment variables.
type Config struct {
	Port         string // PORT (default 8080)
	AppEnv       string // APP_ENV: dev | production (default dev)
	DatabaseURL  string // DATABASE_URL (required)
	FlowsDir     string // FLOWS_DIR: shared flow files (default ../shared/flows)
	NeedsFile    string // NEEDS_FILE: needs vocabulary (default ../shared/vocab/needs.json)
	PublicWebURL string // PUBLIC_WEB_URL: the site's address, for resume links and JobPosting JSON-LD links

	DataEncryptionKey string // DATA_ENCRYPTION_KEY: base64, 32 bytes (support requests)
	CodeHashKey       string // CODE_HASH_KEY: base64, 32 bytes (resume codes)

	STTProviders      []string      // STT_PROVIDERS: tried in order, e.g. "azure,local"
	STTTimeout        time.Duration // STT_TIMEOUT_MS (default 8000)
	AzureSpeechKey    string        // AZURE_SPEECH_KEY
	AzureSpeechRegion string        // AZURE_SPEECH_REGION
	LocalSTTURL       string        // LOCAL_STT_URL

	SMSProvider string // SMS_PROVIDER: console | afromessage | africastalking | twilio

	DevAllowedOriginSuffix string   // DEV_ALLOWED_ORIGIN_SUFFIX: e.g. .trycloudflare.com (dev only)
	ExtraAllowedOrigins    []string // EXTRA_ALLOWED_ORIGINS: e.g. a phone on the LAN, http://192.168.1.20:5173 (dev only)
	TelegramWebhookSecret  string   // TELEGRAM_WEBHOOK_SECRET: checked on POST /telegram/webhook

	SeedStaffPassword string // SEED_STAFF_PASSWORD: password of the demo staff accounts (`seed`)
	SeedClientSecret  string // SEED_CLIENT_SECRET: OAuth secret of the demo partner savanna-demo (`seed`)
}

// Load reads .env (if present, for local runs) and the environment.
func Load() (Config, error) {
	// Only for local runs; in Docker the variables come from the environment.
	_ = godotenv.Load(".env")

	cfg := Config{
		Port:                   getEnv("PORT", "8080"),
		AppEnv:                 getEnv("APP_ENV", "dev"),
		DatabaseURL:            os.Getenv("DATABASE_URL"),
		FlowsDir:               getEnv("FLOWS_DIR", "../shared/flows"),
		NeedsFile:              getEnv("NEEDS_FILE", "../shared/vocab/needs.json"),
		PublicWebURL:           getEnv("PUBLIC_WEB_URL", "http://localhost:5173"),
		DataEncryptionKey:      os.Getenv("DATA_ENCRYPTION_KEY"),
		CodeHashKey:            os.Getenv("CODE_HASH_KEY"),
		STTProviders:           splitList(os.Getenv("STT_PROVIDERS")),
		STTTimeout:             time.Duration(getInt("STT_TIMEOUT_MS", 8000)) * time.Millisecond,
		AzureSpeechKey:         os.Getenv("AZURE_SPEECH_KEY"),
		AzureSpeechRegion:      os.Getenv("AZURE_SPEECH_REGION"),
		LocalSTTURL:            os.Getenv("LOCAL_STT_URL"),
		SMSProvider:            getEnv("SMS_PROVIDER", "console"),
		DevAllowedOriginSuffix: os.Getenv("DEV_ALLOWED_ORIGIN_SUFFIX"),
		ExtraAllowedOrigins:    splitList(os.Getenv("EXTRA_ALLOWED_ORIGINS")),
		TelegramWebhookSecret:  os.Getenv("TELEGRAM_WEBHOOK_SECRET"),
		SeedStaffPassword:      os.Getenv("SEED_STAFF_PASSWORD"),
		SeedClientSecret:       os.Getenv("SEED_CLIENT_SECRET"),
	}

	if cfg.DatabaseURL == "" {
		return cfg, errors.New("DATABASE_URL is not set")
	}
	return cfg, nil
}

// IsDev is true for local development (enables dev-only routes and the tunnel origin rule).
func (c Config) IsDev() bool {
	return c.AppEnv == "dev"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getInt(key string, fallback int) int {
	if n, err := strconv.Atoi(os.Getenv(key)); err == nil {
		return n
	}
	return fallback
}

func splitList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
