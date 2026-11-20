package usecase

import (
	"context"
	"strings"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// SMS to learners. Each one is kept in messages_outbox (queued → sent/failed) and handed to the
// message service, which sends it in the background (SMS_PROVIDER=smsethiopia) or only logs it
// (console). Sending never fails or slows the request that caused it.
//
// Messages are short: an Amharic SMS holds 70 characters (67 per part when longer), and every
// part is paid for.

// outboxWriter is the part of the session repository that queueSMS needs.
type outboxWriter interface {
	CreateOutboxMessage(ctx context.Context, msg *domain.OutboxMessage) (*domain.OutboxMessage, error)
}

func queueSMS(ctx context.Context, outbox outboxWriter, msgs domain.MessageService, phone, body string) {
	queueSMSKept(ctx, outbox, msgs, phone, body, body)
}

// smsSending: the message service says whether SMS really go out (MessageService.Sending).
type smsSending interface{ Sending() bool }

// queueSMSKept is queueSMS for a text with a secret in it (a code, a resume link). When SMS
// really go out, the outbox is only a record, so it keeps `kept` (the text with the secret
// hidden). With the console provider the outbox is the simulated inbox, so it keeps the text.
func queueSMSKept(ctx context.Context, outbox outboxWriter, msgs domain.MessageService, phone, body, kept string) {
	stored := body
	if s, ok := msgs.(smsSending); ok && s.Sending() {
		stored = kept
	}
	var id uuid.UUID
	if outbox != nil {
		provider := "console"
		row, err := outbox.CreateOutboxMessage(ctx, &domain.OutboxMessage{
			Channel: "sms", Recipient: phone, Body: stored, Status: "queued", Provider: &provider,
		})
		if err == nil && row != nil {
			id = row.ID
		}
	}
	if msgs != nil {
		_ = msgs.SendMessage(ctx, &domain.Message{Channel: "sms", Recipient: phone, Body: body, OutboxID: id})
	}
}

// smsPhone: the learner's number for an SMS, only if they chose to be contacted by phone.
func smsPhone(contactMethod, phone string) (string, bool) {
	if contactMethod != "phone" {
		return "", false
	}
	return normalizeEthiopianPhone(phone)
}

func amharic(lang string) bool { return strings.HasPrefix(strings.ToLower(lang), "am") }

// signupSMS: "you are signed up" (and who will help with an ID, on the referral route).
// The Amharic text needs a native speaker's review.
func signupSMS(lang, referralPartner string) string {
	if amharic(lang) {
		s := "Bridge፦ ምዝገባዎ ተጠናቅቋል። አሁን ሥራ መፈለግ ይችላሉ።"
		if referralPartner != "" {
			s += " " + referralPartner + " መታወቂያ እንዲያገኙ ለመርዳት ያነጋግርዎታል።"
		}
		return s
	}
	s := "Bridge: you are signed up. You can now look for jobs."
	if referralPartner != "" {
		s += " " + referralPartner + " will contact you to help you get an ID."
	}
	return s
}

// vouchedSMS: "<organisation> confirmed who you are". The Amharic text needs a native speaker's
// review.
func vouchedSMS(lang, partner string) string {
	if amharic(lang) {
		if partner == "" {
			partner = "አጋር ድርጅት"
		}
		return "Bridge፦ " + partner + " ማንነትዎን አረጋግጧል።"
	}
	if partner == "" {
		partner = "A partner organisation"
	}
	return "Bridge: " + partner + " confirmed who you are."
}

// applicationSMS: "your application was sent". The Amharic text needs a native speaker's review.
func applicationSMS(lang, jobTitle, employer string) string {
	job := jobTitle
	if employer != "" {
		job += " (" + employer + ")"
	}
	if amharic(lang) {
		return "Bridge፦ ለ" + job + " ሥራ ያቀረቡት ማመልከቻ ተልኳል።"
	}
	return "Bridge: your application for " + job + " was sent."
}
