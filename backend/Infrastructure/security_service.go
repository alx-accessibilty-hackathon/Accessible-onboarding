package infrastructure

import (
	"os"

	"github.com/joho/godotenv"
)

// SecurityService: random tokens and their hashes, short resume codes (keyed hash),
// AES-GCM encryption for support requests, bcrypt for staff passwords.
type SecurityService struct {
	dataKey string // DATA_ENCRYPTION_KEY (base64, 32 bytes)
	codeKey string // CODE_HASH_KEY (base64, 32 bytes)
}

func InitSecurityService() *SecurityService {
	_ = godotenv.Load(".env")
	return &SecurityService{
		dataKey: os.Getenv("DATA_ENCRYPTION_KEY"),
		codeKey: os.Getenv("CODE_HASH_KEY"),
	}
}
