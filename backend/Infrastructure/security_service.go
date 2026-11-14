package infrastructure

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"log"
	"math/big"
	"strings"

	domain "bridge/Domain"

	"golang.org/x/crypto/bcrypt"
)

const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // 31 characters: no 0/O, 1/I/L

// SecurityService: random tokens and their hashes, short resume codes (keyed hash),
// AES-GCM encryption for support requests, bcrypt for staff passwords (to come).
type SecurityService struct {
	dataKey []byte // DATA_ENCRYPTION_KEY decoded: 32 bytes (AES-256), nil if missing or invalid
	codeKey []byte // CODE_HASH_KEY: 32 bytes (see InitSecurityService)
}

var _ domain.SecurityService = (*SecurityService)(nil)

// ErrDataKeyMissing: DATA_ENCRYPTION_KEY isn't 32 bytes of base64, so nothing can be encrypted.
// Support requests are then refused instead of being stored unencrypted.
var ErrDataKeyMissing = errors.New("DATA_ENCRYPTION_KEY must be 32 random bytes in base64 (openssl rand -base64 32)")

func InitSecurityService(dataKeyStr, codeKeyStr string) *SecurityService {
	// The code key falls back to the raw text, padded to 32 bytes, when it isn't 32 bytes of base64.
	codeKey, err := base64.StdEncoding.DecodeString(codeKeyStr)
	if err != nil || len(codeKey) != 32 {
		codeKey = make([]byte, 32)
		copy(codeKey, []byte(codeKeyStr))
	}
	s := &SecurityService{
		// The data key has no fallback: a guessable key would make the encryption pointless.
		dataKey: decodeKey(dataKeyStr),
		codeKey: codeKey,
	}
	if s.dataKey == nil {
		log.Print("warning: ", ErrDataKeyMissing, "; saving support requests will fail")
	}
	if codeKeyStr == "" {
		log.Print("warning: CODE_HASH_KEY is empty; resume and verification codes use a zero key (dev only)")
	}
	return s
}

// HashPassword stores a staff password with bcrypt (salted and slow on purpose).
func (s *SecurityService) HashPassword(password string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(h), err
}

// CheckPassword reports whether password matches a bcrypt hash.
func (s *SecurityService) CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
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

// NewToken generates a prefixed random token (128 bits) and its SHA-256 hash.
func (s *SecurityService) NewToken(prefix string) (token string, hash []byte, err error) {
	b := make([]byte, 16) // 128 random bits
	if _, err = rand.Read(b); err != nil {
		return "", nil, err
	}
	token = prefix + base64.RawURLEncoding.EncodeToString(b)
	sum := sha256.Sum256([]byte(token))
	return token, sum[:], nil
}

// HashToken calculates the SHA-256 hash of a token.
func (s *SecurityService) HashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

// NewResumeCode generates a 6-character short code formatted like "K7M-9P2".
func (s *SecurityService) NewResumeCode() (display, normalized string, err error) {
	b := make([]byte, 6)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(codeAlphabet))))
		if err != nil {
			return "", "", err
		}
		b[i] = codeAlphabet[n.Int64()]
	}
	normalized = string(b)
	return normalized[:3] + "-" + normalized[3:], normalized, nil
}

// NormalizeCode converts code to uppercase and strips hyphens and whitespace.
func (s *SecurityService) NormalizeCode(code string) string {
	var sb strings.Builder
	for _, r := range strings.ToUpper(code) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			sb.WriteRune(r)
		}
	}
	return sb.String()
}

// HashCode computes the HMAC-SHA256 of the normalized code using the secret code key.
func (s *SecurityService) HashCode(normalized string) []byte {
	m := hmac.New(sha256.New, s.codeKey)
	m.Write([]byte(normalized))
	return m.Sum(nil)
}

// NewVerificationCode generates a 6-digit numeric code (e.g. "492015") and its HMAC hash.
func (s *SecurityService) NewVerificationCode() (code string, hash []byte, err error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", nil, err
	}
	code = fmt.Sprintf("%06d", n.Int64())
	hash = s.HashCode(code)
	return code, hash, nil
}
