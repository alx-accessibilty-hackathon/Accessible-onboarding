package infrastructure

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"log"

	domain "bridge/Domain"
)

// SecurityService: random tokens and their hashes, short resume codes (keyed hash),
// AES-GCM encryption for support requests, bcrypt for staff passwords.
//
// Built so far: Encrypt and Decrypt (needed by the support request, A2).
// Dev B adds NewToken, HashToken, HashCode, HashPassword and CheckPassword (B2).
type SecurityService struct {
	dataKey []byte // DATA_ENCRYPTION_KEY decoded: 32 bytes (AES-256), nil if missing or invalid
	codeKey []byte // CODE_HASH_KEY decoded: 32 bytes, nil if missing or invalid
}

var _ domain.SecurityService = (*SecurityService)(nil)

// ErrDataKeyMissing: DATA_ENCRYPTION_KEY isn't 32 bytes of base64, so nothing can be encrypted.
// Support requests are then refused instead of being stored unencrypted.
var ErrDataKeyMissing = errors.New("DATA_ENCRYPTION_KEY must be 32 random bytes in base64 (openssl rand -base64 32)")

func InitSecurityService(dataKey, codeKey string) *SecurityService {
	s := &SecurityService{
		dataKey: decodeKey(dataKey),
		codeKey: decodeKey(codeKey),
	}
	if s.dataKey == nil {
		log.Print("warning: ", ErrDataKeyMissing, "; saving support requests will fail")
	}
	return s
}

// decodeKey returns the 32-byte key, or nil if the value isn't 32 bytes of base64.
func decodeKey(b64 string) []byte {
	key, err := base64.StdEncoding.DecodeString(b64)
	if err != nil || len(key) != 32 {
		return nil
	}
	return key
}

// Encrypt seals plaintext with AES-256-GCM and a fresh random nonce. The aad (for example the
// learner ID) is authenticated but not stored: decrypting needs the same aad.
func (s *SecurityService) Encrypt(plaintext []byte, aad string) (nonce, ciphertext []byte, err error) {
	gcm, err := s.gcm()
	if err != nil {
		return nil, nil, err
	}
	nonce = make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, nil, err
	}
	return nonce, gcm.Seal(nil, nonce, plaintext, []byte(aad)), nil
}

// Decrypt opens what Encrypt sealed. It fails if the data, nonce or aad were changed.
func (s *SecurityService) Decrypt(nonce, ciphertext []byte, aad string) ([]byte, error) {
	gcm, err := s.gcm()
	if err != nil {
		return nil, err
	}
	if len(nonce) != gcm.NonceSize() {
		return nil, errors.New("decrypt: wrong nonce size")
	}
	return gcm.Open(nil, nonce, ciphertext, []byte(aad))
}

func (s *SecurityService) gcm() (cipher.AEAD, error) {
	if s.dataKey == nil {
		return nil, ErrDataKeyMissing
	}
	block, err := aes.NewCipher(s.dataKey)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
