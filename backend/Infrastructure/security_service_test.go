package infrastructure

import (
	"bytes"
	"net/http/httptest"
	"testing"

	domain "bridge/Domain"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testKey = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=" // 32 bytes, tests only

func TestEncryptDecrypt(t *testing.T) {
	s := InitSecurityService(testKey, testKey)
	plain := []byte(`{"needs":["screen_reader"],"other_text":"breaks every hour"}`)

	nonce, ct, err := s.Encrypt(plain, "learner-1")
	require.NoError(t, err)
	assert.False(t, bytes.Contains(ct, []byte("screen_reader")))

	got, err := s.Decrypt(nonce, ct, "learner-1")
	require.NoError(t, err)
	assert.Equal(t, plain, got)

	// Another learner's ID, a changed byte or a changed nonce: it won't open.
	_, err = s.Decrypt(nonce, ct, "learner-2")
	assert.Error(t, err)
	tampered := append([]byte(nil), ct...)
	tampered[0] ^= 1
	_, err = s.Decrypt(nonce, tampered, "learner-1")
	assert.Error(t, err)

	// A fresh nonce each time: the same text never encrypts to the same bytes.
	nonce2, ct2, err := s.Encrypt(plain, "learner-1")
	require.NoError(t, err)
	assert.NotEqual(t, nonce, nonce2)
	assert.NotEqual(t, ct, ct2)
}

func TestEncryptNeedsAValidKey(t *testing.T) {
	for _, key := range []string{"", "not base64!", "c2hvcnQ="} { // missing, invalid, too short
		s := InitSecurityService(key, "")
		_, _, err := s.Encrypt([]byte("x"), "a")
		assert.ErrorIs(t, err, ErrDataKeyMissing, key)
		_, err = s.Decrypt(make([]byte, 12), []byte("x"), "a")
		assert.ErrorIs(t, err, ErrDataKeyMissing, key)
	}
}

func TestActorDefaultsToAnonymous(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	assert.Equal(t, domain.ActorAnonymous, ActorFrom(c).Kind)

	learner := domain.Actor{Kind: domain.ActorLearner, ID: uuid.New(), PartnerID: uuid.New()}
	SetActor(c, learner)
	assert.Equal(t, learner, ActorFrom(c))
}
