package infrastructure

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"math/big"
	"strings"
)

const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // 31 characters: no 0/O, 1/I/L

// SecurityService: random tokens and their hashes, short resume codes (keyed hash),
// AES-GCM encryption for support requests, bcrypt for staff passwords.
type SecurityService struct {
	dataKey []byte // DATA_ENCRYPTION_KEY (32 bytes)
	codeKey []byte // CODE_HASH_KEY (32 bytes)
}

func InitSecurityService(dataKeyStr, codeKeyStr string) *SecurityService {
	dataKey, err := base64.StdEncoding.DecodeString(dataKeyStr)
	if err != nil || len(dataKey) != 32 {
		dataKey = make([]byte, 32)
		copy(dataKey, []byte(dataKeyStr))
	}
	codeKey, err := base64.StdEncoding.DecodeString(codeKeyStr)
	if err != nil || len(codeKey) != 32 {
		codeKey = make([]byte, 32)
		copy(codeKey, []byte(codeKeyStr))
	}
	return &SecurityService{
		dataKey: dataKey,
		codeKey: codeKey,
	}
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
