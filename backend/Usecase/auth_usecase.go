package usecase

import (
	"context"
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// AuthUsecase: logout, staff login and "who am I", OAuth client credentials for partner servers.
type AuthUsecase struct {
	SessionRepo domain.SessionRepositoryI
	StaffRepo   domain.StaffRepositoryI
	PartnerRepo domain.PartnerRepositoryI
	Security    domain.SecurityService
}

func NewAuthUsecase(srp domain.SessionRepositoryI, strp domain.StaffRepositoryI, prp domain.PartnerRepositoryI, sec domain.SecurityService) *AuthUsecase {
	return &AuthUsecase{
		SessionRepo: srp,
		StaffRepo:   strp,
		PartnerRepo: prp,
		Security:    sec,
	}
}

// The auth use case issues the learner token for a new registration.
var _ domain.SessionIssuer = (*AuthUsecase)(nil)

// learnerSessionLifetime: learner tokens last 30 days and slide when used (TECHNICAL_PLAN.md 5.6).
const learnerSessionLifetime = 30 * 24 * time.Hour

// IssueLearnerSession implements domain.SessionIssuer for RegistrationUsecase.Start.
//
// STUB until Dev B builds B2: it returns the placeholder token "lt_dev" and stores nothing,
// as BACKEND_TASKS.md allows. The real version creates a random "lt_" token with
// Security.NewToken, stores only its SHA-256 hash in auth_sessions (subject = the learner,
// partner = partnerID) and returns the token once.
func (uc *AuthUsecase) IssueLearnerSession(ctx context.Context, learnerID, partnerID uuid.UUID) (string, time.Time, error) {
	return "lt_dev", time.Now().UTC().Add(learnerSessionLifetime), nil
}
