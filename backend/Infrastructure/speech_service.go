package infrastructure

import (
	"os"
	"strings"

	"github.com/joho/godotenv"
)

// SpeechService tries speech-to-text providers in the order of STT_PROVIDERS
// (for example "azure,local"), skipping cloud ones without consent and slow or failing ones.
// Audio is converted to WAV with ffmpeg first and is never stored.
type SpeechService struct {
	providers []string
}

func InitSpeechService() *SpeechService {
	_ = godotenv.Load(".env")
	var providers []string
	for _, p := range strings.Split(os.Getenv("STT_PROVIDERS"), ",") {
		if p = strings.TrimSpace(p); p != "" {
			providers = append(providers, p)
		}
	}
	return &SpeechService{
		providers: providers,
	}
}
