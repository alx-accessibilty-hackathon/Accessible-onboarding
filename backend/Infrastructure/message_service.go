package infrastructure

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// MessageService sends SMS (and, one day, Telegram) messages.
//
//   - SMS_PROVIDER=console (the default) only logs the message; it stays "queued" in
//     messages_outbox, which is the demo's simulated inbox (GET /api/v1/dev/messages).
//   - SMS_PROVIDER=smsethiopia sends SMS through SMS Ethiopia (https://smsethiopia.com, API v2:
//     POST /api/v2/sms/send, header KEY, body {msisdn, text}). Sending happens in the background,
//     one message at a time, so no request waits for the network; the outbox row then says
//     "sent" (accepted for delivery) or "failed" with the reason. The message text is never
//     logged (it can hold a code). SMS_DAILY_LIMIT and a limit per number protect the credit.
//
// SMS Ethiopia only sends to Ethio Telecom numbers (2519XXXXXXXX) and has no incoming SMS, so
// learners cannot answer by SMS. Its free test campaign only delivers to numbers verified in
// its dashboard (error 10007 otherwise).
type MessageService struct {
	provider string // what SMS_PROVIDER asked for

	smsKey     string // SMSETHIOPIA_API_KEY
	dailyLimit int    // SMS_DAILY_LIMIT: messages per day (per server process); 0 = no limit
	client     *http.Client
	outbox     domain.OutboxStatusI
	queue      chan *domain.Message

	mu        sync.Mutex
	day       string
	dayCount  int
	perNumber map[string][]time.Time // sends to each number in the last hour
}

var smsEthiopiaURL = "https://smsethiopia.com/api/v2/sms/send"

const (
	smsQueueSize     = 200
	smsTimeout       = 20 * time.Second
	smsPerNumberHour = 5 // SMS to one number per hour, whatever asked for them
)

func InitMessageService(provider string) *MessageService {
	return &MessageService{
		provider:  strings.ToLower(strings.TrimSpace(provider)),
		client:    &http.Client{Timeout: smsTimeout},
		perNumber: map[string][]time.Time{},
	}
}

// SetSMSEthiopia turns real SMS on (with SMS_PROVIDER=smsethiopia and a key) and starts the
// sender.
func (m *MessageService) SetSMSEthiopia(key string, dailyLimit int) {
	m.smsKey = strings.TrimSpace(key)
	m.dailyLimit = dailyLimit
	if m.provider == "smsethiopia" && m.smsKey == "" {
		log.Printf("WARNING: SMS_PROVIDER=smsethiopia but SMSETHIOPIA_API_KEY is empty: SMS are only logged (console)")
	}
	if m.realSMS() && m.queue == nil {
		m.queue = make(chan *domain.Message, smsQueueSize)
		go m.sender()
	}
}

// SetOutbox lets the sender record each result on its messages_outbox row.
func (m *MessageService) SetOutbox(o domain.OutboxStatusI) { m.outbox = o }

func (m *MessageService) realSMS() bool { return m.provider == "smsethiopia" && m.smsKey != "" }

// Sending: SMS really go out (SMS_PROVIDER=smsethiopia with a key). Off by default; the
// "signed up" and "application sent" SMS are only made when it is on.
func (m *MessageService) Sending() bool { return m != nil && m.realSMS() }

// Summary says how SMS are sent, for the start-up log.
func (m *MessageService) Summary() string {
	if !m.realSMS() {
		return "console (SMS are only logged and kept in the outbox; set SMS_PROVIDER=smsethiopia and SMSETHIOPIA_API_KEY to send them)"
	}
	limit := "no daily limit"
	if m.dailyLimit > 0 {
		limit = fmt.Sprintf("at most %d a day", m.dailyLimit)
	}
	return fmt.Sprintf("SMS Ethiopia (%s, %d an hour to one number)", limit, smsPerNumberHour)
}

// SendMessage sends an SMS through the provider, in the background, or logs it (console).
func (m *MessageService) SendMessage(ctx context.Context, msg *domain.Message) error {
	if msg == nil {
		return nil
	}
	if msg.Channel != "sms" || !m.realSMS() {
		log.Printf("[MESSAGE_SERVICE] [console] channel=%s to=%s body=%s", msg.Channel, msg.Recipient, msg.Body)
		return nil
	}
	select {
	case m.queue <- msg:
		log.Printf("[SMS QUEUED] to=%s (%d characters)", maskNumber(msg.Recipient), len([]rune(msg.Body)))
	default:
		m.finish(msg, "", errors.New("too many SMS waiting to be sent; try again later"))
	}
	return nil
}

// sender sends the queued SMS one by one.
func (m *MessageService) sender() {
	for msg := range m.queue {
		m.deliver(msg)
	}
}

func (m *MessageService) deliver(msg *domain.Message) {
	msisdn, ok := smsEthiopiaMSISDN(msg.Recipient)
	if !ok {
		m.finish(msg, "", errors.New("SMS Ethiopia only sends to Ethio Telecom numbers (+2519XXXXXXXX)"))
		return
	}
	if err := m.takeQuota(msisdn); err != nil {
		m.finish(msg, "", err)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), smsTimeout)
	defer cancel()
	res, err := m.callSMSEthiopia(ctx, msisdn, msg.Body)
	var se *smsError
	if errors.As(err, &se) && se.status == http.StatusTooManyRequests {
		time.Sleep(3 * time.Second) // rate limited: one more try (the message was not taken)
		res, err = m.callSMSEthiopia(ctx, msisdn, msg.Body)
	}
	if err != nil {
		m.finish(msg, "", err)
		return
	}
	var detail []string
	if res.id != "" && res.id != "0" {
		detail = append(detail, "id="+res.id)
	}
	if res.segments > 0 {
		detail = append(detail, fmt.Sprintf("parts=%d", res.segments))
	}
	if res.status != "" {
		detail = append(detail, "status="+res.status)
	}
	m.finish(msg, strings.Join(detail, " "), nil)
}

// finish logs the result and records it on the outbox row.
func (m *MessageService) finish(msg *domain.Message, detail string, sendErr error) {
	status := "sent"
	var errText *string
	if sendErr != nil {
		status = "failed"
		s := sendErr.Error()
		errText = &s
		log.Printf("[SMS FAILED - SMSETHIOPIA] to=%s: %s", maskNumber(msg.Recipient), s)
	} else {
		log.Printf("[SMS SENT - SMSETHIOPIA] to=%s %s", maskNumber(msg.Recipient), detail)
	}
	if m.outbox == nil || msg.OutboxID == uuid.Nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := m.outbox.MarkOutboxMessage(ctx, msg.OutboxID, status, "smsethiopia", errText); err != nil {
		log.Printf("[SMS] could not record the result in messages_outbox: %v", err)
	}
}

// takeQuota counts one SMS against the daily limit and the limit per number.
func (m *MessageService) takeQuota(msisdn string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	if today := now.Format("2006-01-02"); m.day != today {
		m.day, m.dayCount = today, 0
	}
	if m.dailyLimit > 0 && m.dayCount >= m.dailyLimit {
		return fmt.Errorf("daily SMS limit reached (SMS_DAILY_LIMIT=%d)", m.dailyLimit)
	}
	recent := m.perNumber[msisdn][:0]
	for _, t := range m.perNumber[msisdn] {
		if now.Sub(t) < time.Hour {
			recent = append(recent, t)
		}
	}
	if len(recent) >= smsPerNumberHour {
		m.perNumber[msisdn] = recent
		return fmt.Errorf("too many SMS to this number in the last hour (%d)", smsPerNumberHour)
	}
	m.perNumber[msisdn] = append(recent, now)
	m.dayCount++
	return nil
}

// smsEthiopiaMSISDN: "+251912345678", "0912345678" or "251912345678" → "251912345678".
// SMS Ethiopia takes only 12 digits starting with 2519.
func smsEthiopiaMSISDN(phone string) (string, bool) {
	var b strings.Builder
	for _, r := range phone {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	d := b.String()
	switch {
	case strings.HasPrefix(d, "00251"):
		d = d[2:]
	case len(d) == 10 && strings.HasPrefix(d, "09"):
		d = "251" + d[1:]
	case len(d) == 9 && strings.HasPrefix(d, "9"):
		d = "251" + d
	}
	if len(d) != 12 || !strings.HasPrefix(d, "2519") {
		return "", false
	}
	return d, true
}

// maskNumber keeps the start and the last 3 digits: "+251912345678" → "+2519•••••678".
func maskNumber(p string) string {
	r := []rune(p)
	if len(r) <= 8 {
		return "•••"
	}
	return string(r[:5]) + strings.Repeat("•", len(r)-8) + string(r[len(r)-3:])
}

type smsResult struct {
	id       string
	segments int
	status   string
}

type smsError struct {
	status int    // HTTP status (0: no answer)
	code   string // SMS Ethiopia error code, e.g. "10007"
	msg    string
}

func (e *smsError) Error() string {
	var b strings.Builder
	if e.status != 0 {
		fmt.Fprintf(&b, "HTTP %d", e.status)
	}
	if e.code != "" {
		fmt.Fprintf(&b, ", error %s", e.code)
	}
	if hint := smsEthiopiaHint(e.status, e.code); hint != "" {
		fmt.Fprintf(&b, ": %s", hint)
	}
	if e.msg != "" {
		fmt.Fprintf(&b, " (%s)", truncateForLog(e.msg, 200))
	}
	return strings.TrimPrefix(b.String(), ", ")
}

// What SMS Ethiopia's error codes mean and what to do (from its docs, "Error Codes").
func smsEthiopiaHint(status int, code string) string {
	switch code {
	case "10000":
		return "invalid number: it must be 2519 and 8 more digits"
	case "10002":
		return "the SMS Ethiopia campaign of this key is not active yet"
	case "10005":
		return "no SMS left in the SMS Ethiopia package: renew it"
	case "10006":
		return "the campaign's sender ID is not approved yet"
	case "10007":
		return "the free test campaign only sends to numbers verified in the SMS Ethiopia dashboard: verify this number there"
	}
	switch status {
	case http.StatusUnauthorized:
		return "SMSETHIOPIA_API_KEY was refused (wrong, turned off or deleted)"
	case http.StatusTooManyRequests:
		return "too many requests to SMS Ethiopia"
	}
	return ""
}

var smsErrorCode = regexp.MustCompile(`Error Code\s*::\s*(\d+)`)

func (m *MessageService) callSMSEthiopia(ctx context.Context, msisdn, text string) (*smsResult, error) {
	body, _ := json.Marshal(map[string]string{"msisdn": msisdn, "text": text})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, smsEthiopiaURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("KEY", m.smsKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	res, err := m.client.Do(req)
	if err != nil {
		return nil, &smsError{msg: "no answer from SMS Ethiopia: " + err.Error()}
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 64*1024))

	var data map[string]any
	_ = json.Unmarshal(raw, &data)
	if res.StatusCode >= 200 && res.StatusCode < 300 {
		sent, _ := data["sent"].(bool)
		if s, _ := data["status"].(string); strings.EqualFold(s, "success") {
			sent = true // the older answer shape: {"status": "success", "message": "..."}
		}
		if sent {
			out := &smsResult{status: jsonText(data["status"]), id: jsonText(data["id"])}
			if n, ok := data["segments"].(float64); ok {
				out.segments = int(n)
			}
			return out, nil
		}
	}

	// An error: {"error_message": "... Error Code :: 10005"}, or {"msisdn": "msisdn is
	// mandatory", ...} for a missing field, or a 401/429 with any body.
	e := &smsError{status: res.StatusCode}
	for _, k := range []string{"error_message", "description", "message", "error"} {
		if s := jsonText(data[k]); s != "" {
			e.msg = s
			break
		}
	}
	if e.msg == "" && len(data) > 0 {
		e.msg = truncateForLog(string(raw), 200)
	}
	if mm := smsErrorCode.FindStringSubmatch(e.msg); mm != nil {
		e.code = mm[1]
	}
	if e.status >= 200 && e.status < 300 && e.msg == "" {
		e.msg = "SMS Ethiopia did not accept the message"
	}
	return nil, e
}

// jsonText: a JSON string or number as text ("" otherwise).
func jsonText(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	}
	return ""
}
