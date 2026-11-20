package infrastructure

// Read aloud on the server (POST /api/v1/speech/synthesis), for FIXED interface text only
// (questions, options, buttons, messages; never a learner's own words).
//
// Who speaks:
//   - Amharic: Addis AI (https://addisassistant.com), always the same voice (ADDIS_AI_VOICE_ID,
//     default am-hamen), so every part of a screen sounds like one person.
//   - Then Azure neural voices, when AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are set (Amharic
//     and English).
//   - None of them: ErrSpeechUnavailable, and the widget uses a recording or the device's voice.
//
// Every clip is cached under provider + voice + language + text, in three layers:
//
//	RAM  (this process)                 → fastest
//	DISK (TTS_CACHE_DIR)                → survives a restart where the disk is kept (not on a
//	                                      free hosting plan)
//	DB   (table tts_cache)              → shared by every server, kept across restarts and
//	                                      redeploys
//
// so a provider is paid once per clip, ever: every later request, from any device, is a hit.
// Two requests for the same new clip make one provider call (the second waits for the first).
// A call that started is finished and kept even if the browser stops waiting, so a paid call is
// never thrown away. TTS_DAILY_LIMIT caps the provider calls per day (cache hits are free).
//
// Logs: [TTS HIT - RAM|DISK|DB], [TTS MISS - CALLING <provider>], [TTS MADE], [TTS STORED],
// [TTS WAIT] (joined a call in progress), [TTS LIMIT], [TTS ERROR].

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
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	domain "bridge/Domain"
)

// addisBaseURL: Addis AI's API (a variable only so a check can point it at a stand-in server).
var addisBaseURL = "https://api.addisassistant.com"

const (
	addisDefaultVoice = "am-hamen"  // Hamen, female, conversational (the docs' Amharic example)
	addisOutputFormat = "mp3_44100" // served to the browser as audio/mpeg as it is
	ttsMaxConcurrent  = 3           // provider calls at the same time (a screen asks for many parts)
	ttsCallTimeout    = 45 * time.Second
	ttsStoreTimeout   = 10 * time.Second
	ttsDBReadTimeout  = 3 * time.Second
	maxTTSAudioBytes  = 10 << 20 // 10 MB: a clip of fixed interface text is far smaller
)

// azureTTSVoices: the Azure neural voice per language (used only when Azure is configured).
var azureTTSVoices = map[string]struct{ locale, voice string }{
	"am": {"am-ET", "am-ET-MekdesNeural"},
	"en": {"en-US", "en-US-JennyNeural"},
}

// ttsVoice is one way to read a language: a provider and its fixed voice.
type ttsVoice struct {
	provider string // addis | azure
	voice    string
	locale   string // azure only
}

// ttsCall is a provider call in progress; others asking for the same clip wait for it.
type ttsCall struct {
	done  chan struct{}
	audio []byte
	err   error
}

/* ------------------------------------------------------------------ */
/*  Set-up (from main.go)                                              */
/* ------------------------------------------------------------------ */

// SetCacheDir sets the folder of the on-disk clip cache ("" turns the disk layer off).
func (s *SpeechService) SetCacheDir(dir string) {
	s.cacheDir = dir
	if dir != "" {
		_ = os.MkdirAll(dir, 0o755)
	}
}

// SetTTSStore sets the database layer of the clip cache (shared, kept across restarts).
func (s *SpeechService) SetTTSStore(store domain.TTSCacheRepositoryI) {
	s.ttsStore = store
}

// SetAddisAI turns on Addis AI for Amharic read aloud. voice "" means am-hamen; speed 0 means
// the provider's default (0–100 otherwise).
func (s *SpeechService) SetAddisAI(key, voice string, speed int) {
	s.addisKey = strings.TrimSpace(key)
	s.addisVoice = strings.TrimSpace(voice)
	if s.addisVoice == "" {
		s.addisVoice = addisDefaultVoice
	}
	if speed < 0 || speed > 100 {
		speed = 0
	}
	s.addisSpeed = speed
}

// SetTTSDailyLimit caps provider calls per day (UTC); 0 means no cap. Cache hits never count.
func (s *SpeechService) SetTTSDailyLimit(n int) {
	if n < 0 {
		n = 0
	}
	s.ttsDailyLimit = n
}

// TTSSummary says how read aloud is set up, for the start-up log.
func (s *SpeechService) TTSSummary() string {
	var parts []string
	if s.addisKey != "" {
		speed := "default speed"
		if s.addisSpeed > 0 {
			speed = fmt.Sprintf("speed %d", s.addisSpeed)
		}
		parts = append(parts, fmt.Sprintf("Amharic: Addis AI, voice %s, %s", s.addisVoice, speed))
	}
	if s.azureKey != "" && s.azureRegion != "" {
		parts = append(parts, "Azure neural voices (am, en)")
	}
	if len(parts) == 0 {
		parts = append(parts, "no server voice (set ADDIS_AI_API_KEY for Amharic)")
	}
	layers := []string{"RAM"}
	if s.cacheDir != "" {
		layers = append(layers, "DISK "+s.cacheDir)
	}
	if s.ttsStore != nil {
		layers = append(layers, "DB tts_cache")
	}
	limit := "no daily limit"
	if s.ttsDailyLimit > 0 {
		limit = fmt.Sprintf("at most %d provider calls a day", s.ttsDailyLimit)
	}
	return strings.Join(parts, "; ") + "; cache: " + strings.Join(layers, " → ") + "; " + limit
}

/* ------------------------------------------------------------------ */
/*  Synthesize                                                         */
/* ------------------------------------------------------------------ */

// ttsVoicesFor lists the ways to read `lang`, best first.
func (s *SpeechService) ttsVoicesFor(lang string) []ttsVoice {
	var out []ttsVoice
	if lang == "am" && s.addisKey != "" {
		out = append(out, ttsVoice{provider: "addis", voice: s.addisVoice})
	}
	if v, ok := azureTTSVoices[lang]; ok && s.azureKey != "" && s.azureRegion != "" {
		out = append(out, ttsVoice{provider: "azure", voice: v.voice, locale: v.locale})
	}
	return out
}

// ttsCacheKey names a clip: provider, voice, language and the SHA-256 of the text. Another voice
// (or provider) is another clip, so old audio is never served for a new voice.
func ttsCacheKey(provider, voice, lang, text string) string {
	h := sha256.Sum256([]byte(text))
	return provider + "|" + voice + "|" + lang + "|" + hex.EncodeToString(h[:])
}

// Synthesize reads fixed interface text aloud and returns MP3 audio: from the cache when the
// clip was made before (by any server, for any device), else from the provider, once.
func (s *SpeechService) Synthesize(ctx context.Context, text, language string) ([]byte, error) {
	lang := strings.ToLower(strings.SplitN(strings.TrimSpace(language), "-", 2)[0])
	trimmed := strings.TrimSpace(text)
	if lang == "am" {
		// Only Amharic words go to the voice (tts_text.go); the clip is cached under them.
		trimmed = speakableAmharic(trimmed)
		if trimmed == "" {
			// Nothing Amharic to say (e.g. only "SMS" or digits that are someone's): the widget
			// uses the device's voice for it. A 422, so the widget keeps using the server voice.
			return nil, domain.NewValidationError("text", "not_amharic")
		}
	}
	if trimmed == "" {
		return nil, domain.ErrSpeechUnavailable
	}
	voices := s.ttsVoicesFor(lang)
	if len(voices) == 0 {
		return nil, domain.ErrSpeechUnavailable
	}

	var lastErr error
	for _, v := range voices {
		key := ttsCacheKey(v.provider, v.voice, lang, trimmed)
		if audio, source := s.cachedClip(ctx, key, v, lang); audio != nil {
			log.Printf("[TTS HIT - %s] %s %s/%s (%d bytes): %q",
				source, lang, v.provider, v.voice, len(audio), truncateForLog(trimmed, 40))
			return audio, nil
		}
		if s.isBreakerOpen(v.provider + "-tts") {
			continue
		}
		audio, err := s.generateOnce(ctx, key, v, lang, trimmed)
		if err == nil {
			return audio, nil
		}
		lastErr = err
	}
	if errors.Is(lastErr, domain.ErrRateLimited) {
		return nil, domain.ErrRateLimited
	}
	return nil, domain.ErrSpeechUnavailable
}

// generateOnce makes a clip with the provider, once: a request for a clip already being made
// waits for that call. The call itself doesn't depend on this request, so a browser that stops
// waiting doesn't throw the paid call away: the clip is kept for the next request.
func (s *SpeechService) generateOnce(ctx context.Context, key string, v ttsVoice, lang, text string) ([]byte, error) {
	s.ttsFlightMu.Lock()
	if call, ok := s.ttsFlight[key]; ok {
		s.ttsFlightMu.Unlock()
		log.Printf("[TTS WAIT] %s %s/%s: already being made, waiting for it: %q",
			lang, v.provider, v.voice, truncateForLog(text, 40))
		return waitForCall(ctx, call)
	}
	call := &ttsCall{done: make(chan struct{})}
	s.ttsFlight[key] = call
	s.ttsFlightMu.Unlock()

	go func() {
		defer func() {
			s.ttsFlightMu.Lock()
			delete(s.ttsFlight, key)
			s.ttsFlightMu.Unlock()
			close(call.done)
		}()
		call.audio, call.err = s.generate(context.Background(), key, v, lang, text)
	}()
	return waitForCall(ctx, call)
}

func waitForCall(ctx context.Context, call *ttsCall) ([]byte, error) {
	select {
	case <-call.done:
		return call.audio, call.err
	case <-ctx.Done():
		return nil, domain.ErrSpeechUnavailable // the browser left; the clip is still kept
	}
}

// generate calls the provider (within the daily limit and the concurrency limit), then keeps
// the clip in every cache layer.
func (s *SpeechService) generate(ctx context.Context, key string, v ttsVoice, lang, text string) ([]byte, error) {
	// Another server may have made it meanwhile.
	if audio, source := s.cachedClip(ctx, key, v, lang); audio != nil {
		log.Printf("[TTS HIT - %s] %s %s/%s (%d bytes): %q",
			source, lang, v.provider, v.voice, len(audio), truncateForLog(text, 40))
		return audio, nil
	}
	if !s.takeDailyCall() {
		log.Printf("[TTS LIMIT] %d provider calls today (TTS_DAILY_LIMIT): not calling %s for %q",
			s.ttsDailyLimit, v.provider, truncateForLog(text, 40))
		return nil, domain.ErrSpeechUnavailable
	}

	s.ttsSem <- struct{}{}
	defer func() { <-s.ttsSem }()

	cctx, cancel := context.WithTimeout(ctx, ttsCallTimeout)
	defer cancel()
	log.Printf("[TTS MISS - CALLING %s] %s voice=%s (%d characters): %q",
		strings.ToUpper(v.provider), lang, v.voice, len([]rune(text)), truncateForLog(text, 40))
	start := time.Now()

	var (
		audio []byte
		err   error
	)
	switch v.provider {
	case "addis":
		audio, err = s.callAddisTTS(cctx, key, text, lang, v.voice)
	case "azure":
		audio, err = s.callAzureTTS(cctx, text, v.locale, v.voice)
	default:
		err = fmt.Errorf("unknown tts provider %q", v.provider)
	}
	if err == nil && len(audio) == 0 {
		err = errors.New("empty audio")
	}
	if err != nil {
		log.Printf("[TTS ERROR - %s] %s %q: %v", strings.ToUpper(v.provider), lang, truncateForLog(text, 40), err)
		if !errors.Is(err, domain.ErrRateLimited) { // busy for a moment is not broken
			s.recordFailure(v.provider + "-tts")
		}
		return nil, err
	}
	s.recordSuccess(v.provider + "-tts")
	log.Printf("[TTS MADE - %s] %s voice=%s: %d bytes in %s",
		strings.ToUpper(v.provider), lang, v.voice, len(audio), time.Since(start).Round(time.Millisecond))

	s.storeClip(&domain.TTSClip{
		Key: key, Provider: v.provider, Voice: v.voice, Language: lang, Text: text,
		MimeType: "audio/mpeg", Audio: audio,
	})
	return audio, nil
}

// takeDailyCall counts a provider call against TTS_DAILY_LIMIT (per UTC day, per server).
func (s *SpeechService) takeDailyCall() bool {
	if s.ttsDailyLimit <= 0 {
		return true
	}
	s.ttsDayMu.Lock()
	defer s.ttsDayMu.Unlock()
	today := time.Now().UTC().Format("2006-01-02")
	if s.ttsDay != today {
		s.ttsDay, s.ttsDayCount = today, 0
	}
	if s.ttsDayCount >= s.ttsDailyLimit {
		return false
	}
	s.ttsDayCount++
	return true
}

/* ------------------------------------------------------------------ */
/*  The clip cache: RAM → DISK → DB                                    */
/* ------------------------------------------------------------------ */

var unsafePathChars = regexp.MustCompile(`[^A-Za-z0-9_-]+`)

// clipPath: <TTS_CACHE_DIR>/<provider>/<voice>/<lang>_<hash>.mp3 ("" without a cache folder).
func (s *SpeechService) clipPath(key string, v ttsVoice, lang string) string {
	if s.cacheDir == "" {
		return ""
	}
	h := sha256.Sum256([]byte(key))
	return filepath.Join(s.cacheDir,
		unsafePathChars.ReplaceAllString(v.provider, "_"),
		unsafePathChars.ReplaceAllString(v.voice, "_"),
		unsafePathChars.ReplaceAllString(lang, "_")+"_"+hex.EncodeToString(h[:16])+".mp3")
}

// cachedClip looks the clip up in RAM, then on disk, then in the database (and copies what it
// finds into the faster layers). Nil when it was never made.
func (s *SpeechService) cachedClip(ctx context.Context, key string, v ttsVoice, lang string) ([]byte, string) {
	if cached, ok := s.ttsMem.Load(key); ok {
		return cached.([]byte), "RAM"
	}
	path := s.clipPath(key, v, lang)
	if path != "" {
		if data, err := os.ReadFile(path); err == nil && len(data) > 0 {
			s.ttsMem.Store(key, data)
			return data, "DISK"
		}
	}
	if s.ttsStore != nil {
		dctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), ttsDBReadTimeout)
		defer cancel()
		data, err := s.ttsStore.GetAudio(dctx, key)
		switch {
		case err == nil && len(data) > 0:
			s.ttsMem.Store(key, data)
			s.writeClipFile(path, data)
			return data, "DB"
		case err != nil && !errors.Is(err, domain.ErrNotFound):
			s.warnStore("read", err)
		}
	}
	return nil, ""
}

// storeClip keeps a new clip in every layer (the database write is what makes it last).
func (s *SpeechService) storeClip(clip *domain.TTSClip) {
	s.ttsMem.Store(clip.Key, clip.Audio)
	layers := []string{"RAM"}
	path := s.clipPath(clip.Key, ttsVoice{provider: clip.Provider, voice: clip.Voice}, clip.Language)
	if s.writeClipFile(path, clip.Audio) {
		layers = append(layers, "DISK")
	}
	if s.ttsStore != nil {
		ctx, cancel := context.WithTimeout(context.Background(), ttsStoreTimeout)
		defer cancel()
		if err := s.ttsStore.PutAudio(ctx, clip); err != nil {
			s.warnStore("write", err)
		} else {
			layers = append(layers, "DB")
		}
	}
	log.Printf("[TTS STORED - %s] %s %s/%s (%d bytes): %q", strings.Join(layers, "+"),
		clip.Language, clip.Provider, clip.Voice, len(clip.Audio), truncateForLog(clip.Text, 40))
}

func (s *SpeechService) writeClipFile(path string, audio []byte) bool {
	if path == "" {
		return false
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		log.Printf("warning: tts cache folder %s: %v", filepath.Dir(path), err)
		return false
	}
	if err := os.WriteFile(path, audio, 0o644); err != nil {
		log.Printf("warning: tts cache file %s: %v", path, err)
		return false
	}
	return true
}

// warnStore logs a database cache problem, at most once a minute (e.g. the tts_cache table is
// missing because `bridge migrate` hasn't run yet: read aloud still works, without the DB layer).
func (s *SpeechService) warnStore(op string, err error) {
	s.ttsWarnMu.Lock()
	defer s.ttsWarnMu.Unlock()
	if time.Since(s.ttsWarnedAt) < time.Minute {
		return
	}
	s.ttsWarnedAt = time.Now()
	log.Printf("warning: tts cache database %s failed (has `bridge migrate` run? the tts_cache table "+
		"is needed for a cache that lasts): %v", op, err)
}

/* ------------------------------------------------------------------ */
/*  Addis AI                                                           */
/* ------------------------------------------------------------------ */

// addisRequestID: the same clip always has the same request ID, so if a call is repeated (a
// retry, a lost answer) Addis AI replays the first result instead of charging again.
func (s *SpeechService) addisRequestID(key string) string {
	h := sha256.Sum256([]byte(fmt.Sprintf("%s|%s|%d", key, addisOutputFormat, s.addisSpeed)))
	return "bridge-" + hex.EncodeToString(h[:20])
}

// callAddisTTS: POST /api/v1/voice/generations (synchronous), then download the MP3 from the
// signed audio_url it returns (or decode the audio data URL when one comes inline).
func (s *SpeechService) callAddisTTS(ctx context.Context, key, text, lang, voice string) ([]byte, error) {
	body := map[string]any{
		"text":              text,
		"language":          lang,
		"voice_id":          voice,
		"output_format":     addisOutputFormat,
		"stream":            false,
		"client_request_id": s.addisRequestID(key),
	}
	if s.addisSpeed > 0 {
		body["voice_settings"] = map[string]any{"speed": s.addisSpeed}
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, addisBaseURL+"/api/v1/voice/generations", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-api-key", s.addisKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "bridge-onboarding")

	res, err := s.ttsClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("addis ai request: %w", err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, maxTTSAudioBytes*2)) // may carry inline audio
	if err != nil {
		return nil, fmt.Errorf("addis ai read: %w", err)
	}
	if res.StatusCode == http.StatusTooManyRequests {
		return nil, fmt.Errorf("%w: addis ai 429 (retry after %q): %s",
			domain.ErrRateLimited, res.Header.Get("Retry-After"), addisErrorText(raw))
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return nil, fmt.Errorf("addis ai status %d: %s", res.StatusCode, addisErrorText(raw))
	}

	clip, err := parseAddisClip(raw)
	if err != nil {
		return nil, err
	}
	if clip.creditsRemaining != "" {
		log.Printf("[TTS ADDIS] clip %s, credits remaining: %s", clip.id, clip.creditsRemaining)
	}
	if clip.inline != "" {
		return decodeDataURL(clip.inline)
	}
	return s.downloadAudio(ctx, clip.audioURL)
}

type addisClip struct {
	id               string
	audioURL         string
	inline           string // data:audio/...;base64,...
	creditsRemaining string
}

// parseAddisClip reads a generation response, with or without the {"data": …} envelope.
func parseAddisClip(raw []byte) (*addisClip, error) {
	var top map[string]any
	if err := json.Unmarshal(raw, &top); err != nil {
		return nil, fmt.Errorf("addis ai: not JSON: %s", truncateForLog(string(raw), 200))
	}
	root := top
	if d, ok := top["data"].(map[string]any); ok {
		root = d
	}
	clip := &addisClip{id: jsonString(root["id"])}
	u := jsonString(root["audio_url"])
	if u == "" {
		if p, ok := root["playback"].(map[string]any); ok {
			u = jsonString(p["url"])
		}
	}
	if strings.HasPrefix(u, "data:") {
		clip.inline = u
	} else {
		clip.audioURL = u
	}
	if clip.audioURL == "" && clip.inline == "" {
		// "A first response may also include an audio data URL" (field name not documented).
		for _, v := range root {
			if s, ok := v.(string); ok && strings.HasPrefix(s, "data:audio") {
				clip.inline = s
				break
			}
		}
	}
	if usage, ok := root["usage"].(map[string]any); ok {
		if c, ok := usage["credits_remaining"]; ok && c != nil {
			clip.creditsRemaining = strings.TrimSpace(fmt.Sprint(c) + " " + jsonString(usage["currency"]))
		}
	}
	if clip.audioURL == "" && clip.inline == "" {
		return nil, fmt.Errorf("addis ai: no audio_url in the response: %s", truncateForLog(string(raw), 300))
	}
	return clip, nil
}

// downloadAudio fetches the signed audio URL. It is a public signed link, so the API key is
// sent only to Addis AI's own API host, never to a storage host.
func (s *SpeechService) downloadAudio(ctx context.Context, audioURL string) ([]byte, error) {
	u, err := url.Parse(audioURL)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return nil, fmt.Errorf("addis ai: bad audio_url %q", truncateForLog(audioURL, 80))
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, audioURL, nil)
	if err != nil {
		return nil, err
	}
	if base, _ := url.Parse(addisBaseURL); base != nil && strings.EqualFold(u.Host, base.Host) {
		req.Header.Set("x-api-key", s.addisKey)
	}
	res, err := s.ttsClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("addis ai audio download: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return nil, fmt.Errorf("addis ai audio download status %d: %s", res.StatusCode, truncateForLog(string(b), 200))
	}
	ct := strings.ToLower(res.Header.Get("Content-Type"))
	if strings.Contains(ct, "json") || strings.Contains(ct, "html") {
		return nil, fmt.Errorf("addis ai audio download: got %s instead of audio", ct)
	}
	audio, err := io.ReadAll(io.LimitReader(res.Body, maxTTSAudioBytes))
	if err != nil {
		return nil, fmt.Errorf("addis ai audio download: %w", err)
	}
	return audio, nil
}

// decodeDataURL: "data:audio/mpeg;base64,AAAA…" → the bytes.
func decodeDataURL(dataURL string) ([]byte, error) {
	comma := strings.IndexByte(dataURL, ',')
	if comma < 0 || !strings.Contains(dataURL[:comma], ";base64") {
		return nil, errors.New("addis ai: inline audio is not a base64 data URL")
	}
	audio, err := base64.StdEncoding.DecodeString(dataURL[comma+1:])
	if err != nil {
		return nil, fmt.Errorf("addis ai: inline audio: %w", err)
	}
	return audio, nil
}

// addisErrorText: `{"status":"error","error":{"code":…,"message":…}}` → "code: message".
func addisErrorText(raw []byte) string {
	var e struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
		Message string `json:"message"`
	}
	if json.Unmarshal(raw, &e) == nil {
		if e.Error.Code != "" || e.Error.Message != "" {
			return strings.Trim(e.Error.Code+": "+e.Error.Message, ": ")
		}
		if e.Message != "" {
			return e.Message
		}
	}
	return truncateForLog(strings.TrimSpace(string(raw)), 300)
}

func jsonString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

// LogAddisVoices lists Addis AI's voices for a language at start-up (GET /api/v1/voice/voices,
// costs no credits) and warns when the configured voice is missing or unavailable, so the
// voice ID can be checked before anyone listens.
func (s *SpeechService) LogAddisVoices(ctx context.Context, lang string) {
	if s.addisKey == "" {
		return
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		addisBaseURL+"/api/v1/voice/voices?language="+url.QueryEscape(lang), nil)
	if err != nil {
		return
	}
	req.Header.Set("x-api-key", s.addisKey)
	req.Header.Set("Accept", "application/json")
	res, err := s.ttsClient.Do(req)
	if err != nil {
		log.Printf("warning: addis ai voice list: %v", err)
		return
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if res.StatusCode != http.StatusOK {
		log.Printf("warning: addis ai voice list: status %d: %s (check ADDIS_AI_API_KEY)",
			res.StatusCode, addisErrorText(raw))
		return
	}
	voices := findVoiceList(raw)
	if len(voices) == 0 {
		log.Printf("addis ai voices (%s): could not read the list: %s", lang, truncateForLog(string(raw), 300))
		return
	}
	found, available := false, false
	lines := make([]string, 0, len(voices))
	for _, v := range voices {
		id := jsonString(v["id"])
		avail := v["is_available"] != false && v["isAvailable"] != false
		state := "available"
		if !avail {
			state = "unavailable"
		}
		lines = append(lines, fmt.Sprintf("%s (%s, %s, %s)", id, jsonString(v["name"]), jsonString(v["gender"]), state))
		if id == s.addisVoice {
			found, available = true, avail
		}
	}
	log.Printf("addis ai voices (%s): %s", lang, strings.Join(lines, "; "))
	switch {
	case !found:
		log.Printf("WARNING: ADDIS_AI_VOICE_ID=%s is not in Addis AI's %s voice list: pick one of the IDs above", s.addisVoice, lang)
	case !available:
		log.Printf("WARNING: ADDIS_AI_VOICE_ID=%s is marked unavailable by Addis AI: pick an available voice", s.addisVoice)
	default:
		log.Printf("addis ai: using voice %s for every %s clip", s.addisVoice, lang)
	}
}

// findVoiceList finds the array of voices in a response: [...], {"data":[...]},
// {"data":{"voices":[...]}} or {"voices":[...]}.
func findVoiceList(raw []byte) []map[string]any {
	var any0 any
	if json.Unmarshal(raw, &any0) != nil {
		return nil
	}
	var walk func(v any, depth int) []map[string]any
	walk = func(v any, depth int) []map[string]any {
		switch t := v.(type) {
		case []any:
			out := make([]map[string]any, 0, len(t))
			for _, item := range t {
				if m, ok := item.(map[string]any); ok && jsonString(m["id"]) != "" {
					out = append(out, m)
				}
			}
			if len(out) > 0 {
				return out
			}
		case map[string]any:
			if depth > 2 {
				return nil
			}
			for _, k := range []string{"data", "voices", "items", "results"} {
				if inner, ok := t[k]; ok {
					if found := walk(inner, depth+1); len(found) > 0 {
						return found
					}
				}
			}
		}
		return nil
	}
	return walk(any0, 0)
}

/* ------------------------------------------------------------------ */
/*  Azure                                                              */
/* ------------------------------------------------------------------ */

// callAzureTTS calls the Azure neural TTS REST endpoint and returns MP3 bytes.
func (s *SpeechService) callAzureTTS(ctx context.Context, text, locale, voice string) ([]byte, error) {
	var escaped bytes.Buffer
	if err := xml.EscapeText(&escaped, []byte(text)); err != nil {
		return nil, err
	}
	ssml := fmt.Sprintf(`<speak version="1.0" xml:lang="%s"><voice name="%s">%s</voice></speak>`, locale, voice, escaped.String())

	endpoint := fmt.Sprintf("https://%s.tts.speech.microsoft.com/cognitiveservices/v1", s.azureRegion)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(ssml))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Ocp-Apim-Subscription-Key", s.azureKey)
	req.Header.Set("Content-Type", "application/ssml+xml")
	req.Header.Set("X-Microsoft-OutputFormat", "audio-24khz-48kbitrate-mono-mp3")
	req.Header.Set("User-Agent", "bridge-onboarding")

	res, err := s.ttsClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("azure tts request: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusTooManyRequests {
		return nil, fmt.Errorf("%w: azure tts 429", domain.ErrRateLimited)
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("azure tts status %d", res.StatusCode)
	}
	return io.ReadAll(io.LimitReader(res.Body, maxTTSAudioBytes))
}

// truncateForLog shortens text for a log line.
func truncateForLog(s string, maxRunes int) string {
	runes := []rune(s)
	if len(runes) <= maxRunes {
		return s
	}
	return string(runes[:maxRunes]) + "…"
}
