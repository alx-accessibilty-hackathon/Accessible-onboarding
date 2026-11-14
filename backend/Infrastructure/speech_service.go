package infrastructure

import "time"

// SpeechService tries speech-to-text providers in the order of STT_PROVIDERS
// (for example "azure,local"), skipping cloud ones without consent and slow or failing ones.
// Audio is converted to WAV with ffmpeg first and is never stored.
type SpeechService struct {
	providers []string
	timeout   time.Duration
}

func InitSpeechService(providers []string, timeout time.Duration) *SpeechService {
	return &SpeechService{
		providers: providers,
		timeout:   timeout,
	}
}
