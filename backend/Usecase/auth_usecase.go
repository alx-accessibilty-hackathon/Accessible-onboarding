package usecase

import (
	"context"
	"crypto/subtle"
	"errors"
	"strings"
	"sync"
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// AuthUsecase: tokens for learners, staff and partner servers (TECHNICAL_PLAN.md 5.6).
// A token is random, shown once, and only its SHA-256 hash is stored in auth_sessions.
// Its prefix says what kind it is: lt_ (learner), st_ (staff), pt_ (partner server).
type AuthUsecase struct {
	SessionRepo domain.SessionRepositoryI
	StaffRepo   domain.StaffRepositoryI
	PartnerRepo domain.PartnerRepositoryI
	LearnerRepo domain.LearnerRepositoryI
	Security    domain.SecurityService

	dummyOnce sync.Once
	dummyHash string // compared against when the email is unknown, so both failures take as long
}

var (
	_ domain.AuthUsecaseI  = (*AuthUsecase)(nil)
	_ domain.SessionIssuer = (*AuthUsecase)(nil) // issues the learner token for a new registration
)

func NewAuthUsecase(srp domain.SessionRepositoryI, strp domain.StaffRepositoryI, prp domain.PartnerRepositoryI, lrp domain.LearnerRepositoryI, sec domain.SecurityService) *AuthUsecase {
	return &AuthUsecase{
		SessionRepo: srp,
		StaffRepo:   strp,
		PartnerRepo: prp,
		LearnerRepo: lrp,
		Security:    sec,
	}
}

const (
	LearnerTokenPrefix = "lt_"
	StaffTokenPrefix   = "st_"
	PartnerTokenPrefix = "pt_"

	learnerSessionLifetime = 30 * 24 * time.Hour // slides when used
	staffSessionLifetime   = 12 * time.Hour
	partnerTokenLifetime   = time.Hour

	ScopeLearnersRead = "learners:read"
)

// Scopes a partner server may ask for.
var partnerScopes = map[string]bool{ScopeLearnersRead: true}

// IssueLearnerSession creates the learner's session when a registration starts.
func (uc *AuthUsecase) IssueLearnerSession(ctx context.Context, learnerID, _ uuid.UUID) (string, time.Time, error) {
	return uc.newSession(ctx, LearnerTokenPrefix, &domain.AuthSession{
		SubjectType: string(domain.ActorLearner),
		SubjectID:   learnerID,
		ExpiresAt:   time.Now().UTC().Add(learnerSessionLifetime),
	})
}

func (uc *AuthUsecase) newSession(ctx context.Context, prefix string, s *domain.AuthSession) (string, time.Time, error) {
	token, hash, err := uc.Security.NewToken(prefix)
	if err != nil {
		return "", time.Time{}, err
	}
	s.TokenHash = hash
	if _, err := uc.SessionRepo.CreateAuthSession(ctx, s); err != nil {
		return "", time.Time{}, err
	}
	return token, s.ExpiresAt, nil
}

// ResolveToken finds the session behind a token and returns who is calling.
func (uc *AuthUsecase) ResolveToken(ctx context.Context, token string) (*domain.Actor, error) {
	sess, err := uc.session(ctx, token)
	if err != nil {
		return nil, err
	}

	switch domain.ActorKind(sess.SubjectType) {
	case domain.ActorLearner:
		learner, err := uc.LearnerRepo.GetByID(ctx, sess.SubjectID)
		if errors.Is(err, domain.ErrNotFound) || (err == nil && learner.Status == "deleted") {
			return nil, domain.ErrUnauthorized
		}
		if err != nil {
			return nil, err
		}
		next := time.Now().UTC().Add(learnerSessionLifetime)
		_ = uc.SessionRepo.TouchAuthSession(ctx, sess.ID, &next) // best effort: never fail a request on it
		return &domain.Actor{Kind: domain.ActorLearner, ID: learner.ID, PartnerID: learner.PartnerID}, nil

	case domain.ActorStaff:
		staff, err := uc.StaffRepo.GetByID(ctx, sess.SubjectID)
		if errors.Is(err, domain.ErrNotFound) {
			return nil, domain.ErrUnauthorized
		}
		if err != nil {
			return nil, err
		}
		_ = uc.SessionRepo.TouchAuthSession(ctx, sess.ID, nil)
		actor := &domain.Actor{Kind: domain.ActorStaff, ID: staff.ID, Role: staff.Role, EmployerID: staff.EmployerID, ActingFor: sess.ActingFor}
		if staff.PartnerID != nil {
			actor.PartnerID = *staff.PartnerID
		}
		return actor, nil

	case domain.ActorPartnerServer:
		_ = uc.SessionRepo.TouchAuthSession(ctx, sess.ID, nil)
		return &domain.Actor{Kind: domain.ActorPartnerServer, ID: sess.SubjectID, PartnerID: sess.SubjectID, Scopes: sess.Scopes}, nil
	}
	return nil, domain.ErrUnauthorized
}

// Logout revokes the session of this token ("Forget me on this phone", staff sign-out).
func (uc *AuthUsecase) Logout(ctx context.Context, token string) error {
	sess, err := uc.session(ctx, token)
	if err != nil {
		return err
	}
	return uc.SessionRepo.RevokeAuthSession(ctx, sess.ID)
}

func (uc *AuthUsecase) session(ctx context.Context, token string) (*domain.AuthSession, error) {
	if token == "" {
		return nil, domain.ErrUnauthorized
	}
	sess, err := uc.SessionRepo.GetAuthSessionByTokenHash(ctx, uc.Security.HashToken(token))
	if errors.Is(err, domain.ErrNotFound) {
		return nil, domain.ErrUnauthorized // unknown, expired or revoked
	}
	return sess, err
}

// StaffLogin checks email and password and starts a 12-hour staff session.
func (uc *AuthUsecase) StaffLogin(ctx context.Context, email, password string) (string, time.Time, *domain.StaffUser, error) {
	fail := func(err error) (string, time.Time, *domain.StaffUser, error) { return "", time.Time{}, nil, err }

	staff, err := uc.StaffRepo.GetByEmail(ctx, strings.TrimSpace(email))
	if errors.Is(err, domain.ErrNotFound) {
		uc.Security.CheckPassword(uc.dummy(), password) // same time as a wrong password
		return fail(domain.ErrUnauthorized)
	}
	if err != nil {
		return fail(err)
	}
	if !uc.Security.CheckPassword(staff.PasswordHash, password) {
		return fail(domain.ErrUnauthorized)
	}
	token, expiresAt, err := uc.newSession(ctx, StaffTokenPrefix, &domain.AuthSession{
		SubjectType: string(domain.ActorStaff),
		SubjectID:   staff.ID,
		ExpiresAt:   time.Now().UTC().Add(staffSessionLifetime),
	})
	if err != nil {
		return fail(err)
	}
	return token, expiresAt, staff, nil
}

func (uc *AuthUsecase) dummy() string {
	uc.dummyOnce.Do(func() { uc.dummyHash, _ = uc.Security.HashPassword("no-such-user-password") })
	return uc.dummyHash
}

func (uc *AuthUsecase) StaffMe(ctx context.Context, actor domain.Actor) (*domain.StaffUser, error) {
	if actor.Kind != domain.ActorStaff {
		return nil, domain.ErrUnauthorized
	}
	return uc.StaffRepo.GetByID(ctx, actor.ID)
}

// IssuePartnerToken: OAuth 2.0 client credentials for a partner's server (level 2 API).
// The client secret is stored as a SHA-256 hash and compared in constant time.
func (uc *AuthUsecase) IssuePartnerToken(ctx context.Context, clientID, secret, scope string) (string, int, string, error) {
	fail := func(err error) (string, int, string, error) { return "", 0, "", err }

	partner, secretHash, err := uc.PartnerRepo.GetByClientID(ctx, clientID)
	if errors.Is(err, domain.ErrNotFound) {
		return fail(domain.ErrUnauthorized)
	}
	if err != nil {
		return fail(err)
	}
	if len(secretHash) == 0 || subtle.ConstantTimeCompare(uc.Security.HashToken(secret), secretHash) != 1 {
		return fail(domain.ErrUnauthorized)
	}

	scopes := strings.Fields(scope)
	if len(scopes) == 0 {
		scopes = []string{ScopeLearnersRead}
	}
	for _, s := range scopes {
		if !partnerScopes[s] {
			return fail(domain.NewValidationError("scope", "invalid_scope"))
		}
	}

	token, _, err := uc.newSession(ctx, PartnerTokenPrefix, &domain.AuthSession{
		SubjectType: string(domain.ActorPartnerServer),
		SubjectID:   partner.ID,
		Scopes:      scopes,
		ExpiresAt:   time.Now().UTC().Add(partnerTokenLifetime),
	})
	if err != nil {
		return fail(err)
	}
	return token, int(partnerTokenLifetime.Seconds()), strings.Join(scopes, " "), nil
}
