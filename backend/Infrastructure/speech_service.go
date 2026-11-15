package infrastructure

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
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
	geminiKey   string // Google AI Studio key — used only for TTS (Synthesize), not STT
	cacheDir    string // directory for persistent on-disk TTS audio cache
	httpClient  *http.Client

	mu        sync.Mutex
	geminiMu  sync.Mutex // serializes Gemini TTS calls to prevent burst 429 errors
	fails     map[string]int
	openUntil map[string]time.Time
	ttsCache  sync.Map // in-memory cache: cacheKey (lang|text) -> []byte (mp3)
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

func (s *SpeechService) SetGemini(key string) {
	s.geminiKey = key
}

func (s *SpeechService) SetCacheDir(dir string) {
	s.cacheDir = dir
	if dir != "" {
		_ = os.MkdirAll(dir, 0755)
	}
}

func (s *SpeechService) cacheFilePath(lang, text string) string {
	if s.cacheDir == "" {
		return ""
	}
	h := sha256.Sum256([]byte(lang + ":" + strings.TrimSpace(text)))
	hashHex := hex.EncodeToString(h[:16])
	return filepath.Join(s.cacheDir, fmt.Sprintf("%s_%s.mp3", lang, hashHex))
}

func (s *SpeechService) loadCachedAudio(lang, text string) ([]byte, string) {
	memKey := lang + "|" + text
	if cached, ok := s.ttsCache.Load(memKey); ok {
		return cached.([]byte), "RAM"
	}

	path := s.cacheFilePath(lang, text)
	if path == "" {
		return nil, ""
	}

	data, err := os.ReadFile(path)
	if err == nil && len(data) > 0 {
		s.ttsCache.Store(memKey, data)
		return data, "DISK"
	}
	return nil, ""
}

func (s *SpeechService) storeCachedAudio(lang, text string, audio []byte) {
	if len(audio) == 0 {
		return
	}
	memKey := lang + "|" + text
	s.ttsCache.Store(memKey, audio)

	path := s.cacheFilePath(lang, text)
	if path == "" {
		return
	}
	if err := os.WriteFile(path, audio, 0644); err != nil {
		log.Printf("warning: could not write tts audio cache to %s: %v", path, err)
	} else {
		log.Printf("[TTS CACHED TO DISK] %s (%d bytes): %s", lang, len(audio), path)
	}
}

func truncateForLog(s string, maxRunes int) string {
	runes := []rune(s)
	if len(runes) <= maxRunes {
		return s
	}
	return string(runes[:maxRunes]) + "…"
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

// ttsVoices: the Azure neural voice per language for read-aloud. Languages without a voice
// here answer ErrSpeechUnavailable, and the widget falls back to recordings or the device voice.
var ttsVoices = map[string]struct{ locale, voice string }{
	"am": {"am-ET", "am-ET-MekdesNeural"},
	"en": {"en-US", "en-US-JennyNeural"},
}

// geminiTTSVoices: a natural, expressive Gemini voice per language.
// Gemini TTS auto-detects the script, so the same voice works for Amharic text.
// "Aoede" is warm and clear; suitable for an onboarding assistant.
var geminiTTSVoices = map[string]string{
	"am": "Aoede",
	"en": "Aoede",
}

// geminiTTSModel is the lightweight Gemini Flash-Lite TTS model supporting Amharic.
const geminiTTSModel = "gemini-3.8-flash-lite-tts"

// Synthesize reads text aloud and returns MP3 audio.
// It checks persistent cache first (memory + disk), then Azure (if configured), then Gemini (if configured).
// The widget only sends fixed interface text here — never a learner's own answers.
func (s *SpeechService) Synthesize(ctx context.Context, text, language string) ([]byte, error) {
	lang := strings.ToLower(strings.SplitN(language, "-", 2)[0])
	trimmed := strings.TrimSpace(text)

	// Serve from persistent cache if already synthesized (memory or disk, 0ms, 0 API quota).
	if cached, source := s.loadCachedAudio(lang, trimmed); cached != nil {
		log.Printf("[TTS HIT - %s] %s (%d bytes): %q", source, lang, len(cached), truncateForLog(trimmed, 35))
		return cached, nil
	}

	log.Printf("[TTS MISS - API CALL] %s: %q", lang, truncateForLog(trimmed, 35))

	// 1. Azure TTS
	if v, ok := ttsVoices[lang]; ok && s.azureKey != "" && s.azureRegion != "" && !s.isBreakerOpen("azure-tts") {
		audio, err := s.callAzureTTS(ctx, trimmed, v.locale, v.voice)
		if err == nil {
			s.recordSuccess("azure-tts")
			s.storeCachedAudio(lang, trimmed, audio)
			return audio, nil
		}
		log.Printf("azure tts failed: %v", err)
		s.recordFailure("azure-tts")
	}

	// 2. Gemini TTS (Google AI Studio key — free tier, supports Amharic)
	if s.geminiKey != "" && !s.isBreakerOpen("gemini-tts") {
		voice := geminiTTSVoices[lang]
		if voice == "" {
			voice = "Aoede" // safe default for unlisted languages
		}
		audio, err := s.callGeminiTTS(ctx, trimmed, voice)
		if err == nil {
			s.recordSuccess("gemini-tts")
			s.storeCachedAudio(lang, trimmed, audio)
			return audio, nil
		}
		log.Printf("gemini tts failed: %v", err)
		if errors.Is(err, domain.ErrRateLimited) {
			// Don't trip breaker on transient rate limits, return ErrRateLimited directly
			return nil, domain.ErrRateLimited
		}
		s.recordFailure("gemini-tts")
	}

	return nil, domain.ErrSpeechUnavailable
}

// callAzureTTS calls the Azure neural TTS REST endpoint and returns MP3 bytes.
func (s *SpeechService) callAzureTTS(ctx context.Context, text, locale, voice string) ([]byte, error) {
	var escaped bytes.Buffer
	if err := xml.EscapeText(&escaped, []byte(text)); err != nil {
		return nil, err
	}
	ssml := fmt.Sprintf(`<speak version="1.0" xml:lang="%s"><voice name="%s">%s</voice></speak>`, locale, voice, escaped.String())

	url := fmt.Sprintf("https://%s.tts.speech.microsoft.com/cognitiveservices/v1", s.azureRegion)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(ssml))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Ocp-Apim-Subscription-Key", s.azureKey)
	req.Header.Set("Content-Type", "application/ssml+xml")
	req.Header.Set("X-Microsoft-OutputFormat", "audio-24khz-48kbitrate-mono-mp3")
	req.Header.Set("User-Agent", "bridge-onboarding")

	res, err := s.httpClient.Do(req)
	if err != nil {
		return nil, domain.ErrSpeechUnavailable
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, domain.ErrSpeechUnavailable
	}
	return io.ReadAll(io.LimitReader(res.Body, 5<<20))
}

// callGeminiTTS calls the Gemini API generateContent endpoint with audio output modality.
// It receives base64-encoded audio (WAV or raw PCM), decodes it, then converts to MP3 with ffmpeg.
func (s *SpeechService) callGeminiTTS(ctx context.Context, text, voice string) ([]byte, error) {
	s.geminiMu.Lock()
	defer s.geminiMu.Unlock()

	// Gentle pacing between calls prevents burst 429 errors from Google's rate limiter.
	time.Sleep(300 * time.Millisecond)

	body := map[string]any{
		"contents": []map[string]any{
			{"parts": []map[string]any{{"text": text}}},
		},
		"generationConfig": map[string]any{
			"responseModalities": []string{"AUDIO"},
			"speechConfig": map[string]any{
				"voiceConfig": map[string]any{
					"prebuiltVoiceConfig": map[string]any{
						"voiceName": voice,
					},
				},
			},
		},
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
		geminiTTSModel, s.geminiKey,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gemini tts request: %w", err)
	}
	defer res.Body.Close()

	// If rate-limited (429), back off briefly and retry once
	if res.StatusCode == http.StatusTooManyRequests {
		res.Body.Close()
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(1200 * time.Millisecond):
		}

		reqRetry, errRetry := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
		if errRetry == nil {
			reqRetry.Header.Set("Content-Type", "application/json")
			if resRetry, errRetry2 := s.httpClient.Do(reqRetry); errRetry2 == nil {
				res = resRetry
				defer res.Body.Close()
			}
		}
	}

	if res.StatusCode == http.StatusTooManyRequests {
		return nil, domain.ErrRateLimited
	}

	if res.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(io.LimitReader(res.Body, 2<<10))
		return nil, fmt.Errorf("gemini tts status %d: %s", res.StatusCode, string(bodyBytes))
	}

	var geminiRes struct {
		Candidates []struct {
			FinishReason string `json:"finishReason"`
			Content      struct {
				Parts []struct {
					InlineData struct {
						MimeType string `json:"mimeType"`
						Data     string `json:"data"` // base64-encoded audio
					} `json:"inlineData"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.NewDecoder(res.Body).Decode(&geminiRes); err != nil {
		return nil, fmt.Errorf("gemini tts decode: %w", err)
	}
	if len(geminiRes.Candidates) == 0 || len(geminiRes.Candidates[0].Content.Parts) == 0 {
		finishReason := "unknown"
		if len(geminiRes.Candidates) > 0 {
			finishReason = geminiRes.Candidates[0].FinishReason
		}
		return nil, fmt.Errorf("gemini tts empty response (finishReason: %s)", finishReason)
	}

	part := geminiRes.Candidates[0].Content.Parts[0]
	audioBytes, err := base64.StdEncoding.DecodeString(part.InlineData.Data)
	if err != nil {
		return nil, fmt.Errorf("gemini tts base64 decode: %w", err)
	}

	// Convert audio (WAV or PCM) → MP3 so client receives consistent audio/mpeg.
	return audioToMP3(ctx, audioBytes, part.InlineData.MimeType)
}

// audioToMP3 uses ffmpeg to transcode audio bytes to MP3, handling both WAV and raw PCM.
func audioToMP3(ctx context.Context, input []byte, mimeType string) ([]byte, error) {
	args := []string{"-hide_banner", "-loglevel", "error"}
	if strings.Contains(mimeType, "pcm") || strings.Contains(mimeType, "L16") {
		args = append(args, "-f", "s16le", "-ar", "24000", "-ac", "1")
	}
	args = append(args,
		"-i", "pipe:0",
		"-codec:a", "libmp3lame", "-b:a", "48k",
		"-f", "mp3", "pipe:1",
	)

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	cmd.Stdin = bytes.NewReader(input)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ffmpeg to mp3: %w (stderr: %s)", err, stderr.String())
	}
	return stdout.Bytes(), nil
}
