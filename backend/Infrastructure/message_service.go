package infrastructure

import (
	"os"

	"github.com/joho/godotenv"
)

// MessageService sends SMS or Telegram messages. SMS_PROVIDER=console (the default)
// only records the message so the demo's simulated inbox can show it.
type MessageService struct {
	provider string
}

func InitMessageService() *MessageService {
	_ = godotenv.Load(".env")
	provider := os.Getenv("SMS_PROVIDER")
	if provider == "" {
		provider = "console"
	}
	return &MessageService{
		provider: provider,
	}
}
