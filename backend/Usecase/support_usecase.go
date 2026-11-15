package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// SupportUsecase saves a learner's support request (needs), encrypted (R6, Q3).
type SupportUsecase struct {
	SupportRepo      domain.SupportRepositoryI
	RegistrationRepo domain.RegistrationRepositoryI // to check the registration is the actor's
	Flows            domain.FlowStore               // the needs vocabulary
	Security         domain.SecurityService
}

var _ domain.SupportUsecaseI = (*SupportUsecase)(nil)

func NewSupportUsecase(srp domain.SupportRepositoryI, rrp domain.RegistrationRepositoryI, flows domain.FlowStore, sec domain.SecurityService) *SupportUsecase {
	return &SupportUsecase{
		SupportRepo:      srp,
		RegistrationRepo: rrp,
		Flows:            flows,
		Security:         sec,
	}
}

const maxSupportOtherText = 500 // runes, as in the support_other step

// supportPayload is what gets encrypted. It is the only place the needs exist in plain form.
type supportPayload struct {
	Needs     []string `json:"needs"`
	OtherText string   `json:"other_text"`
}

// Save replaces the learner's support request. Every need must be a code from
// shared/vocab/needs.json. The needs and the free text are encrypted together with
// AES-256-GCM, using the learner ID as additional data, so the database only ever holds
// bytes (and a ciphertext copied onto another learner won't decrypt).
func (uc *SupportUsecase) Save(ctx context.Context, actor domain.Actor, regID uuid.UUID, req *domain.SupportRequest) (time.Time, error) {
	reg, err := loadOwnedRegistration(ctx, uc.RegistrationRepo, actor, regID)
	if err != nil {
		return time.Time{}, err
	}

	needs := make([]string, 0, len(req.Needs))
	seen := make(map[string]bool, len(req.Needs))
	for _, code := range req.Needs {
		if !uc.Flows.IsNeedCode(code) {
			return time.Time{}, domain.NewValidationError("needs", codeInvalidChoice)
		}
		if !seen[code] {
			seen[code] = true
			needs = append(needs, code)
		}
	}
	other := strings.TrimSpace(req.OtherText)
	if utf8.RuneCountInString(other) > maxSupportOtherText {
		return time.Time{}, domain.NewValidationError("other_text", codeTooLong)
	}

	plaintext, err := json.Marshal(supportPayload{Needs: needs, OtherText: other})
	if err != nil {
		return time.Time{}, err
	}
	nonce, ciphertext, err := uc.Security.Encrypt(plaintext, reg.LearnerID.String())
	if err != nil {
		return time.Time{}, err
	}
	return uc.SupportRepo.Upsert(ctx, reg.LearnerID, nonce, ciphertext, req.ShareCourses, req.ShareEmployers)
}

// openSupportRequest decrypts a stored support request (the learner ID is the additional
// data). Callers decide who may see it: the learner themself (GET /me), or an employer the
// learner attached it to (with an audit log row).
func openSupportRequest(sec domain.SecurityService, s *domain.SealedSupportRequest) (*domain.SupportRequest, error) {
	plaintext, err := sec.Decrypt(s.Nonce, s.Ciphertext, s.LearnerID.String())
	if err != nil {
		return nil, fmt.Errorf("decrypt support request: %w", err)
	}
	var p supportPayload
	if err := json.Unmarshal(plaintext, &p); err != nil {
		return nil, fmt.Errorf("read support request: %w", err)
	}
	if p.Needs == nil {
		p.Needs = []string{}
	}
	return &domain.SupportRequest{
		LearnerID:      s.LearnerID,
		Needs:          p.Needs,
		OtherText:      p.OtherText,
		ShareCourses:   s.ShareCourses,
		ShareEmployers: s.ShareEmployers,
		UpdatedAt:      s.UpdatedAt,
	}, nil
}
