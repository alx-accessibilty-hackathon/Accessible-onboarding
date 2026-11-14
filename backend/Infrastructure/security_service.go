package infrastructure

// SecurityService: random tokens and their hashes, short resume codes (keyed hash),
// AES-GCM encryption for support requests, bcrypt for staff passwords.
type SecurityService struct {
	dataKey string // DATA_ENCRYPTION_KEY (base64, 32 bytes)
	codeKey string // CODE_HASH_KEY (base64, 32 bytes)
}

func InitSecurityService(dataKey, codeKey string) *SecurityService {
	return &SecurityService{
		dataKey: dataKey,
		codeKey: codeKey,
	}
}
