package infrastructure

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
