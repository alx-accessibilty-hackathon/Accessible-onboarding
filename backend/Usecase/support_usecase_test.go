package usecase

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"

	domain "bridge/Domain"
	infrastructure "bridge/Infrastructure"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newSupportFixture(t *testing.T) (*SupportUsecase, regFixture, *infrastructure.SecurityService) {
	t.Helper()
	rf := newRegFixture(t)
	sec := infrastructure.InitSecurityService(testKey, testKey)
	uc := NewSupportUsecase(fakeSupport{rf.store}, fakeRegistrations{rf.store}, loadFlows(t), sec)
	return uc, rf, sec
}

func TestSupportRequestIsStoredEncrypted(t *testing.T) {
	uc, rf, sec := newSupportFixture(t)
	reg, actor := rf.start(t)

	_, err := uc.Save(context.Background(), actor, reg.ID, &domain.SupportRequest{
		Needs:        []string{"screen_reader", "extra_time", "screen_reader"},
		OtherText:    "I need breaks every hour",
		ShareCourses: true,
	})
	require.NoError(t, err)

	row, ok := rf.store.support[reg.LearnerID]
	require.True(t, ok)
	assert.True(t, row.shareCourses)
	assert.False(t, row.shareEmployers)
	for _, secret := range []string{"screen_reader", "extra_time", "breaks every hour"} {
		assert.False(t, bytes.Contains(row.ciphertext, []byte(secret)), "ciphertext contains %q", secret)
	}

	// Only this learner's ID opens it.
	plain, err := sec.Decrypt(row.nonce, row.ciphertext, reg.LearnerID.String())
	require.NoError(t, err)
	assert.JSONEq(t, `{"needs":["screen_reader","extra_time"],"other_text":"I need breaks every hour"}`, string(plain))
	_, err = sec.Decrypt(row.nonce, row.ciphertext, uuid.NewString())
	assert.Error(t, err)

	// GET /registrations/:id now says it was sent, without the needs.
	view, err := rf.uc.Get(context.Background(), actor, reg.ID)
	require.NoError(t, err)
	assert.True(t, view.SupportSubmitted)
}

func TestSupportRequestRejectsUnknownNeedsAndLongText(t *testing.T) {
	uc, rf, _ := newSupportFixture(t)
	reg, actor := rf.start(t)

	_, err := uc.Save(context.Background(), actor, reg.ID, &domain.SupportRequest{Needs: []string{"screen_reader", "jetpack"}})
	assert.Equal(t, map[string]string{"needs": "invalid_choice"}, fieldCodes(t, err))

	_, err = uc.Save(context.Background(), actor, reg.ID, &domain.SupportRequest{OtherText: strings.Repeat("ሀ", 501)})
	assert.Equal(t, map[string]string{"other_text": "too_long"}, fieldCodes(t, err))

	assert.Empty(t, rf.store.support, "nothing saved")
}

func TestSupportRequestOnlyForTheLearner(t *testing.T) {
	uc, rf, _ := newSupportFixture(t)
	reg, _ := rf.start(t)
	other := domain.Actor{Kind: domain.ActorLearner, ID: uuid.New()}
	_, err := uc.Save(context.Background(), other, reg.ID, &domain.SupportRequest{Needs: []string{"captions"}})
	assert.ErrorIs(t, err, domain.ErrForbidden)
}

func TestSupportRequestRefusedWithoutEncryptionKey(t *testing.T) {
	rf := newRegFixture(t)
	uc := NewSupportUsecase(fakeSupport{rf.store}, fakeRegistrations{rf.store}, loadFlows(t), infrastructure.InitSecurityService("", ""))
	reg, actor := rf.start(t)
	_, err := uc.Save(context.Background(), actor, reg.ID, &domain.SupportRequest{Needs: []string{"captions"}})
	assert.ErrorIs(t, err, infrastructure.ErrDataKeyMissing)
	assert.Empty(t, rf.store.support, "never stored unencrypted")
}

// The payload format is what the support inbox (Should) will decrypt.
func TestSupportPayloadShape(t *testing.T) {
	b, err := json.Marshal(supportPayload{Needs: []string{}, OtherText: ""})
	require.NoError(t, err)
	assert.JSONEq(t, `{"needs":[],"other_text":""}`, string(b))
}
