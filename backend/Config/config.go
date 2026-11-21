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
	STTTimeout        time.Duration // STT_TIMEOUT_MS (default 20000: an upload to a cloud service from a phone on 3G)
	AzureSpeechKey    string        // AZURE_SPEECH_KEY
	AzureSpeechRegion string        // AZURE_SPEECH_REGION
	LocalSTTURL       string        // LOCAL_STT_URL
	AddisAIAPIKey     string        // ADDIS_AI_API_KEY: Addis AI key, turns on the Amharic server voice (read aloud)
	AddisAIVoiceID    string        // ADDIS_AI_VOICE_ID: the one Amharic voice for every clip (default am-hamen)
	AddisAISpeed      int           // ADDIS_AI_SPEED: 1–100, or 0 for the provider's default (default 0)
	TTSCacheDir       string        // TTS_CACHE_DIR: on-disk read-aloud clip cache, "" for none (default ./data/tts_cache)
	TTSDailyLimit     int           // TTS_DAILY_LIMIT: paid read-aloud calls per day, 0 = no limit (default 300); cache hits are free

	SMSProvider       string // SMS_PROVIDER: console (log only, the default) | smsethiopia
	SMSEthiopiaAPIKey string // SMSETHIOPIA_API_KEY: SMS Ethiopia key (Dashboard → Console → API Keys)
	SMSDailyLimit     int    // SMS_DAILY_LIMIT: SMS sent per day, 0 = no limit (default 50)

	PartnerSelfService      bool // PARTNER_SELF_SERVICE: POST /partners creates partners and keys (default on; "off" turns it off)
	PartnerSignupDailyLimit int  // PARTNER_SIGNUP_DAILY_LIMIT: new partners per day, 0 = no limit (default 500)

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
		Port:                    getEnv("PORT", "8080"),
		AppEnv:                  getEnv("APP_ENV", "dev"),
		DatabaseURL:             os.Getenv("DATABASE_URL"),
		FlowsDir:                getEnv("FLOWS_DIR", "../shared/flows"),
		NeedsFile:               getEnv("NEEDS_FILE", "../shared/vocab/needs.json"),
		PublicWebURL:            getEnv("PUBLIC_WEB_URL", "http://localhost:5173"),
		DataEncryptionKey:       os.Getenv("DATA_ENCRYPTION_KEY"),
		CodeHashKey:             os.Getenv("CODE_HASH_KEY"),
		STTProviders:            splitList(os.Getenv("STT_PROVIDERS")),
		STTTimeout:              time.Duration(getInt("STT_TIMEOUT_MS", 20000)) * time.Millisecond,
		AzureSpeechKey:          os.Getenv("AZURE_SPEECH_KEY"),
		AzureSpeechRegion:       os.Getenv("AZURE_SPEECH_REGION"),
		LocalSTTURL:             os.Getenv("LOCAL_STT_URL"),
		AddisAIAPIKey:           os.Getenv("ADDIS_AI_API_KEY"),
		AddisAIVoiceID:          getEnv("ADDIS_AI_VOICE_ID", "am-hamen"),
		AddisAISpeed:            getInt("ADDIS_AI_SPEED", 0),
		TTSCacheDir:             getEnvOrEmpty("TTS_CACHE_DIR", "./data/tts_cache"),
		TTSDailyLimit:           getInt("TTS_DAILY_LIMIT", 300),
		SMSProvider:             getEnv("SMS_PROVIDER", "console"),
		SMSEthiopiaAPIKey:       os.Getenv("SMSETHIOPIA_API_KEY"),
		SMSDailyLimit:           getInt("SMS_DAILY_LIMIT", 50),
		PartnerSelfService:      !isOff(os.Getenv("PARTNER_SELF_SERVICE")),
		PartnerSignupDailyLimit: getInt("PARTNER_SIGNUP_DAILY_LIMIT", 500),
		DevAllowedOriginSuffix:  os.Getenv("DEV_ALLOWED_ORIGIN_SUFFIX"),
		ExtraAllowedOrigins:     splitList(os.Getenv("EXTRA_ALLOWED_ORIGINS")),
		TelegramWebhookSecret:   os.Getenv("TELEGRAM_WEBHOOK_SECRET"),
		SeedStaffPassword:       os.Getenv("SEED_STAFF_PASSWORD"),
		SeedClientSecret:        os.Getenv("SEED_CLIENT_SECRET"),
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

// PublicWebURLProblem explains what is wrong with PUBLIC_WEB_URL for a hosted API ("" if
// nothing). It goes into resume links and every JobPosting (the "acc" namespace and the
// address returned on publish), so on a hosted API a localhost address breaks them for
// everyone. Not set at all also counts, because the default is localhost.
func (c Config) PublicWebURLProblem() string {
	raw, set := os.LookupEnv("PUBLIC_WEB_URL")
	if !set || strings.TrimSpace(raw) == "" {
		return "PUBLIC_WEB_URL is not set, so links use " + c.PublicWebURL +
			": set it to the public https:// address of the site (e.g. https://accessible-onboarding.vercel.app)"
	}
	lower := strings.ToLower(c.PublicWebURL)
	if !c.IsDev() && (strings.Contains(lower, "localhost") || strings.Contains(lower, "127.0.0.1")) {
		return "PUBLIC_WEB_URL is " + c.PublicWebURL + " while APP_ENV is " + c.AppEnv +
			": JobPosting and resume links will point to a local address"
	}
	return ""
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// getEnvOrEmpty is like getEnv, but a variable set to "" stays "" (to turn something off).
func getEnvOrEmpty(key, fallback string) string {
	if v, set := os.LookupEnv(key); set {
		return strings.TrimSpace(v)
	}
	return fallback
}

func getInt(key string, fallback int) int {
	if n, err := strconv.Atoi(os.Getenv(key)); err == nil {
		return n
	}
	return fallback
}

// isOff: "off", "false", "0" or "no" (any case) turn a setting off; anything else keeps it on.
func isOff(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "off", "false", "0", "no":
		return true
	}
	return false
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
