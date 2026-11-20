package infrastructure

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"strconv"
	"strings"
	"time"

	domain "bridge/Domain"
)

// Speech-to-text with Addis AI Scribe (STT_PROVIDERS=addis, the same ADDIS_AI_API_KEY as the
// Amharic voice): POST /api/v1/scribe/transcribe?backend=turbo&language=am|en&request_id=…,
// multipart field "audio"; the text is data.text. Billed per transcribed character from the
// same Addis AI credit as read aloud.
//
// It is a cloud service: Transcribe uses it only when the learner agreed to cloud speech.
// Each try has its own request_id (a failed ID cannot be reused).

// Languages Scribe transcribes (its docs: am is the default; en, om, ti, ha, sid, wal, sw).
var addisSTTLanguages = map[string]bool{"am": true, "en": true, "om": true, "ti": true, "ha": true, "sid": true, "wal": true, "sw": true}

// addisSTTLanguage: "am", "am-ET", "en-US" → the Scribe language code ("" if not supported).
func addisSTTLanguage(lang string) string {
	l := strings.ToLower(strings.TrimSpace(lang))
	if i := strings.IndexAny(l, "-_"); i > 0 {
		l = l[:i]
	}
	if addisSTTLanguages[l] {
		return l
	}
	return ""
}

// audioFile names the upload from its first bytes (ffmpeg makes WAV; without ffmpeg the
// browser's own WebM or MP4 is sent as it is).
func audioFile(b []byte) (name, contentType string) {
	switch {
	case len(b) >= 12 && string(b[:4]) == "RIFF" && string(b[8:12]) == "WAVE":
		return "clip.wav", "audio/wav"
	case len(b) >= 4 && string(b[:4]) == "\x1a\x45\xdf\xa3":
		return "clip.webm", "audio/webm"
	case len(b) >= 4 && string(b[:4]) == "OggS":
		return "clip.ogg", "audio/ogg"
	case len(b) >= 8 && string(b[4:8]) == "ftyp":
		return "clip.m4a", "audio/mp4"
	}
	return "clip.webm", "audio/webm"
}

func (s *SpeechService) callAddisSTT(ctx context.Context, audio []byte, lang string) (*domain.Transcription, error) {
	code := addisSTTLanguage(lang)
	if code == "" {
		return nil, fmt.Errorf("addis: language %q is not supported by Scribe", lang)
	}
	// A new ID for each try: Addis refuses an ID whose request failed (409 REQUEST_INTERRUPTED).
	// The one retry below (429, busy) keeps it, as Addis asks.
	var rnd [12]byte
	if _, err := rand.Read(rnd[:]); err != nil {
		return nil, err
	}
	q := url.Values{}
	q.Set("backend", "turbo")
	q.Set("language", code)
	q.Set("request_id", "bridge-stt-"+hex.EncodeToString(rnd[:]))
	endpoint := strings.TrimRight(addisBaseURL, "/") + "/api/v1/scribe/transcribe?" + q.Encode()

	name, contentType := audioFile(audio)
	started := time.Now()
	for attempt := 1; ; attempt++ {
		var body bytes.Buffer
		mw := multipart.NewWriter(&body)
		h := make(textproto.MIMEHeader)
		h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="audio"; filename="%s"`, name))
		h.Set("Content-Type", contentType)
		part, err := mw.CreatePart(h)
		if err != nil {
			return nil, err
		}
		if _, err := part.Write(audio); err != nil {
			return nil, err
		}
		if err := mw.Close(); err != nil {
			return nil, err
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &body)
		if err != nil {
			return nil, err
		}
		req.Header.Set("x-api-key", s.addisKey)
		req.Header.Set("Content-Type", mw.FormDataContentType())
		req.Header.Set("Accept", "application/json")

		res, err := s.httpClient.Do(req)
		if err != nil {
			log.Printf("[STT ERROR - ADDIS] %s: no answer: %v", code, err)
			return nil, err
		}
		raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		res.Body.Close()

		// Busy: wait as told (at most 3 s) and try once more with the same request_id.
		if res.StatusCode == http.StatusTooManyRequests && attempt == 1 {
			wait := 2 * time.Second
			if sec, err := strconv.Atoi(res.Header.Get("Retry-After")); err == nil && sec > 0 && sec <= 3 {
				wait = time.Duration(sec) * time.Second
			}
			select {
			case <-time.After(wait):
				continue
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		if res.StatusCode != http.StatusOK {
			msg := addisErrorText(raw)
			hint := ""
			switch res.StatusCode {
			case http.StatusUnauthorized, http.StatusForbidden:
				hint = " (check ADDIS_AI_API_KEY)"
			case http.StatusPaymentRequired:
				hint = " (the Addis AI credit is used up: top it up)"
			case http.StatusUnprocessableEntity:
				hint = " (the recording could not be read)"
			}
			log.Printf("[STT ERROR - ADDIS] %s: HTTP %d: %s%s", code, res.StatusCode, truncateForLog(msg, 200), hint)
			return nil, fmt.Errorf("addis scribe returned status %d: %s", res.StatusCode, msg)
		}

		var out struct {
			Data struct {
				Text    string  `json:"text"`
				Seconds float64 `json:"seconds"`
			} `json:"data"`
			Text string `json:"text"`
		}
		if err := json.Unmarshal(raw, &out); err != nil {
			return nil, fmt.Errorf("addis scribe: unreadable answer: %w", err)
		}
		text := strings.TrimSpace(out.Data.Text)
		if text == "" {
			text = strings.TrimSpace(out.Text)
		}
		log.Printf("[STT - ADDIS] %s: %.1f s of audio → %d characters in %d ms",
			code, out.Data.Seconds, len([]rune(text)), time.Since(started).Milliseconds())
		// No words is an answer, not a failure: the widget says "We didn't catch that".
		return &domain.Transcription{Text: text, Confidence: -1, Provider: "addis"}, nil
	}
}
