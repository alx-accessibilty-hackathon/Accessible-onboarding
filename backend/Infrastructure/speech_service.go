package infrastructure

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"

	domain "bridge/Domain"
)

// SpeechService tries speech-to-text providers in the order of STT_PROVIDERS
// (for example "azure,local,mock"), skipping cloud ones without consent and slow or failing ones.
// Audio is converted to WAV with ffmpeg first and is never stored.
type SpeechService struct {
	providers   []string
	timeout     time.Duration
	azureKey    string
	azureRegion string
	localURL    string
	httpClient  *http.Client

	mu        sync.Mutex
	fails     map[string]int
	openUntil map[string]time.Time
}

var _ domain.SpeechService = (*SpeechService)(nil)

func InitSpeechService(providers []string, timeout time.Duration) *SpeechService {
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	return &SpeechService{
		providers:  providers,
		timeout:    timeout,
		httpClient: &http.Client{Timeout: timeout},
		fails:      make(map[string]int),
		openUntil:  make(map[string]time.Time),
	}
}

func (s *SpeechService) SetAzure(key, region string) {
	s.azureKey = key
	s.azureRegion = region
}

func (s *SpeechService) SetLocalURL(url string) {
	s.localURL = url
}

// HasServerSpeech returns true if at least one speech provider is configured.
func (s *SpeechService) HasServerSpeech() bool {
	return s != nil && len(s.providers) > 0
}

// HasCloudSpeech returns true if a cloud speech provider (e.g. azure, google) is configured.
func (s *SpeechService) HasCloudSpeech() bool {
	if s == nil {
		return false
	}
	for _, p := range s.providers {
		if isCloudProvider(p) {
			return true
		}
	}
	return false
}

func isCloudProvider(provider string) bool {
	p := strings.ToLower(strings.TrimSpace(provider))
	return p == "azure" || p == "google" || p == "cloud"
}

func (s *SpeechService) isBreakerOpen(provider string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	until, ok := s.openUntil[provider]
	if !ok {
		return false
	}
	if time.Now().Before(until) {
		return true
	}
	delete(s.openUntil, provider)
	s.fails[provider] = 0
	return false
}

func (s *SpeechService) recordSuccess(provider string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.fails[provider] = 0
	delete(s.openUntil, provider)
}

func (s *SpeechService) recordFailure(provider string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.fails[provider]++
	if s.fails[provider] >= 3 {
		s.openUntil[provider] = time.Now().Add(60 * time.Second)
	}
}

func (s *SpeechService) Transcribe(ctx context.Context, audio []byte, language string, cloudConsent bool) (*domain.Transcription, error) {
	if len(audio) == 0 {
		return nil, errors.New("empty audio")
	}

	if len(s.providers) == 0 {
		return nil, domain.ErrSpeechUnavailable
	}

	// Convert audio to 16kHz mono WAV using ffmpeg if available
	wavAudio, err := convertToWav(ctx, audio)
	if err != nil {
		// Fallback to original audio if ffmpeg conversion fails (e.g. mock unit tests)
		wavAudio = audio
	}

	var lastErr error
	for _, provider := range s.providers {
		providerName := strings.ToLower(strings.TrimSpace(provider))
		if providerName == "" {
			continue
		}

		// Cloud providers require explicit consent
		if isCloudProvider(providerName) && !cloudConsent {
			continue
		}

		// Circuit breaker check
		if s.isBreakerOpen(providerName) {
			continue
		}

		cctx, cancel := context.WithTimeout(ctx, s.timeout)
		t, err := s.callProvider(cctx, providerName, wavAudio, language)
		cancel()

		if err == nil && t != nil {
			s.recordSuccess(providerName)
			return t, nil
		}

		s.recordFailure(providerName)
		lastErr = err
	}

	if lastErr != nil {
		return nil, fmt.Errorf("%w: %v", domain.ErrSpeechUnavailable, lastErr)
	}
	return nil, domain.ErrSpeechUnavailable
}

func (s *SpeechService) callProvider(ctx context.Context, provider string, wav []byte, lang string) (*domain.Transcription, error) {
	switch provider {
	case "mock":
		return s.callMock(lang), nil

	case "azure":
		if s.azureKey == "" || s.azureRegion == "" {
			return nil, errors.New("azure credentials not configured")
		}
		return s.callAzure(ctx, wav, lang)

	case "local":
		if s.localURL == "" {
			return nil, errors.New("local STT URL not configured")
		}
		return s.callLocal(ctx, wav, lang)

	default:
		return nil, fmt.Errorf("unknown speech provider: %s", provider)
	}
}

func (s *SpeechService) callMock(lang string) *domain.Transcription {
	text := "zero nine one two three four five six seven eight"
	conf := 0.90
	if strings.HasPrefix(strings.ToLower(lang), "am") {
		text = "ዜሮ ዘጠኝ አንድ ሁለት ሶስት አራት አምስት ስድስት ሰባት ስምንት"
		conf = 0.85
	}
	return &domain.Transcription{
		Text:       text,
		Confidence: conf,
		Provider:   "mock",
	}
}

func (s *SpeechService) callAzure(ctx context.Context, wav []byte, lang string) (*domain.Transcription, error) {
	locale := "en-US"
	if strings.HasPrefix(strings.ToLower(lang), "am") {
		locale = "am-ET"
	}

	endpoint := fmt.Sprintf("https://%s.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=%s&format=detailed",
		s.azureRegion, locale)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(wav))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Ocp-Apim-Subscription-Key", s.azureKey)
	req.Header.Set("Content-Type", "audio/wav; codecs=audio/pcm; samplerate=16000")

	res, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		return nil, fmt.Errorf("azure speech returned status %d: %s", res.StatusCode, string(body))
	}

	var azureRes struct {
		RecognitionStatus string `json:"RecognitionStatus"`
		NBest             []struct {
			Confidence float64 `json:"Confidence"`
			Display    string  `json:"Display"`
		} `json:"NBest"`
	}

	if err := json.NewDecoder(res.Body).Decode(&azureRes); err != nil {
		return nil, err
	}

	if len(azureRes.NBest) == 0 || azureRes.RecognitionStatus != "Success" {
		return nil, errors.New("azure speech recognition returned no match")
	}

	return &domain.Transcription{
		Text:       azureRes.NBest[0].Display,
		Confidence: azureRes.NBest[0].Confidence,
		Provider:   "azure",
	}, nil
}

func (s *SpeechService) callLocal(ctx context.Context, wav []byte, lang string) (*domain.Transcription, error) {
	url := strings.TrimRight(s.localURL, "/") + "/inference"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(wav))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "audio/wav")

	res, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("local STT returned status %d", res.StatusCode)
	}

	var localRes struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(res.Body).Decode(&localRes); err != nil {
		return nil, err
	}

	return &domain.Transcription{
		Text:       strings.TrimSpace(localRes.Text),
		Confidence: -1, // whisper.cpp does not always return confidence
		Provider:   "local",
	}, nil
}

func convertToWav(ctx context.Context, input []byte) ([]byte, error) {
	cmd := exec.CommandContext(ctx, "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", "16000", "-f", "wav", "pipe:1")
	cmd.Stdin = bytes.NewReader(input)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ffmpeg error: %w (stderr: %s)", err, stderr.String())
	}
	return stdout.Bytes(), nil
}
