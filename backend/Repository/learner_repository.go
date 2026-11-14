package repository

import "github.com/jackc/pgx/v5/pgxpool"

// LearnerRepository handles learners, their ID evidence and referrals.
// Tables: learners, identity_evidence, referrals.
type LearnerRepository struct {
	DB *pgxpool.Pool
}

func NewLearnerRepo(db *pgxpool.Pool) *LearnerRepository {
	return &LearnerRepository{
		DB: db,
	}
}
