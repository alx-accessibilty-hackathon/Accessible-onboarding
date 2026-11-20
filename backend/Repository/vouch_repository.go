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

// VouchRepository keeps the trusted-referral codes and records a vouch.
// Table: vouch_codes (+ learners, identity_evidence, referrals, audit_log). Queries: queries/vouch.sql.
type VouchRepository struct {
	DB *pgxpool.Pool
	Q  *sqlc.Queries
}

var _ domain.VouchRepositoryI = (*VouchRepository)(nil)

func NewVouchRepo(db *pgxpool.Pool) *VouchRepository {
	return &VouchRepository{DB: db, Q: sqlc.New(db)}
}

func (r *VouchRepository) Create(ctx context.Context, c *domain.VouchCode, audit *domain.AuditEntry) error {
	tx, err := r.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) // does nothing after Commit
	q := r.Q.WithTx(tx)
	if err := q.RetireVouchCodes(ctx, c.ReferralID); err != nil {
		return err
	}
	row, err := q.CreateVouchCode(ctx, sqlc.CreateVouchCodeParams{
		ReferralID: c.ReferralID, LearnerID: c.LearnerID, PartnerID: c.PartnerID, StaffID: c.StaffID,
		CodeHash: c.CodeHash, ExpiresAt: c.ExpiresAt,
	})
	if err != nil {
		return err
	}
	c.ID, c.ExpiresAt = row.ID, row.ExpiresAt
	if audit != nil {
		if err := createAuditLog(ctx, q, audit); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (r *VouchRepository) Active(ctx context.Context, learnerID uuid.UUID) (*domain.VouchCode, error) {
	row, err := r.Q.GetActiveVouchCode(ctx, learnerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &domain.VouchCode{
		ID: row.ID, ReferralID: row.ReferralID, LearnerID: row.LearnerID, PartnerID: row.PartnerID,
		StaffID: row.StaffID, CodeHash: row.CodeHash, FailedAttempts: int(row.FailedAttempts),
		ExpiresAt: row.ExpiresAt,
	}, nil
}

func (r *VouchRepository) AddFailure(ctx context.Context, id uuid.UUID) (int, error) {
	n, err := r.Q.AddVouchCodeFailure(ctx, id)
	return int(n), err
}

func (r *VouchRepository) Attest(ctx context.Context, c *domain.VouchCode, audit *domain.AuditEntry) error {
	tx, err := r.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	q := r.Q.WithTx(tx)
	n, err := q.UseVouchCode(ctx, c.ID)
	if err != nil {
		return err
	}
	if n == 0 {
		return domain.ErrNotFound // used a moment ago
	}
	if err := q.SetLearnerIdentityLevel(ctx, sqlc.SetLearnerIdentityLevelParams{ID: c.LearnerID, IdentityLevel: domain.IdentityPartnerAttested}); err != nil {
		return err
	}
	staff := c.StaffID
	if err := q.AttestLatestIdentityEvidence(ctx, sqlc.AttestLatestIdentityEvidenceParams{LearnerID: c.LearnerID, AttestedBy: &staff}); err != nil {
		return err
	}
	if err := q.SetReferralAttested(ctx, c.ReferralID); err != nil {
		return err
	}
	if audit != nil {
		if err := createAuditLog(ctx, q, audit); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
