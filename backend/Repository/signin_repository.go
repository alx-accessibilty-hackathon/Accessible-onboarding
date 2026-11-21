package repository

import (
	"context"
	"errors"

	domain "bridge/Domain"
	sqlc "bridge/Repository/sqlc"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SignInCodeRepository keeps each registered learner's sign-in code.
// Table: signin_codes (migration 00008). Queries: queries/signin_codes.sql.
type SignInCodeRepository struct {
	DB *pgxpool.Pool
	Q  *sqlc.Queries
}

var _ domain.SignInCodeRepositoryI = (*SignInCodeRepository)(nil)

func NewSignInCodeRepo(db *pgxpool.Pool) *SignInCodeRepository {
	return &SignInCodeRepository{DB: db, Q: sqlc.New(db)}
}

func (r *SignInCodeRepository) GetByLearner(ctx context.Context, learnerID uuid.UUID) (*domain.SignInCode, error) {
	row, err := r.Q.GetSignInCodeByLearner(ctx, learnerID)
	return toSignInCode(row, err)
}

func (r *SignInCodeRepository) GetByHash(ctx context.Context, codeHash []byte) (*domain.SignInCode, error) {
	row, err := r.Q.GetSignInCodeByHash(ctx, codeHash)
	return toSignInCode(row, err)
}

// Save stores a new code for the learner (replacing the old one). A hash that another learner
// already has is ErrAlreadyExists (the caller makes another code).
func (r *SignInCodeRepository) Save(ctx context.Context, c *domain.SignInCode) (*domain.SignInCode, error) {
	row, err := r.Q.UpsertSignInCode(ctx, sqlc.UpsertSignInCodeParams{
		LearnerID: c.LearnerID, CodeHash: c.CodeHash, CodeNonce: c.CodeNonce, CodeCiphertext: c.CodeCiphertext,
	})
	if hasPgCode(err, pgUniqueViolation) {
		return nil, domain.ErrAlreadyExists
	}
	return toSignInCode(row, err)
}

func (r *SignInCodeRepository) RecordFailure(ctx context.Context, learnerID uuid.UUID) (*domain.SignInCode, error) {
	row, err := r.Q.RecordSignInFailure(ctx, learnerID)
	return toSignInCode(row, err)
}

func (r *SignInCodeRepository) RecordSuccess(ctx context.Context, learnerID uuid.UUID) error {
	return r.Q.RecordSignInSuccess(ctx, learnerID)
}

func toSignInCode(row sqlc.SigninCode, err error) (*domain.SignInCode, error) {
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &domain.SignInCode{
		LearnerID:      row.LearnerID,
		CodeHash:       row.CodeHash,
		CodeNonce:      row.CodeNonce,
		CodeCiphertext: row.CodeCiphertext,
		FailedAttempts: int(row.FailedAttempts),
		LockedUntil:    row.LockedUntil,
		LastUsedAt:     row.LastUsedAt,
		CreatedAt:      row.CreatedAt,
	}, nil
}
