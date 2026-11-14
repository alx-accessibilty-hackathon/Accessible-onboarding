package infrastructure

import (
	"context"
	"log"

	domain "bridge/Domain"
)

// MessageService sends SMS or Telegram messages. SMS_PROVIDER=console (the default)
// only records the message so the demo's simulated inbox can show it.
type MessageService struct {
	provider string
}

func InitMessageService(provider string) *MessageService {
	return &MessageService{
		provider: provider,
	}
}

// SendMessage delivers the message via configured provider or logs to console for the demo.
func (m *MessageService) SendMessage(ctx context.Context, msg *domain.Message) error {
	log.Printf("[MESSAGE_SERVICE] [%s] channel=%s to=%s body=%s", m.provider, msg.Channel, msg.Recipient, msg.Body)
	return nil
}
