package repository

import "github.com/jackc/pgx/v5/pgxpool"

// SupportRepository stores support requests. Only encrypted bytes are stored.
// Table: support_requests.
type SupportRepository struct {
	DB *pgxpool.Pool
}

func NewSupportRepo(db *pgxpool.Pool) *SupportRepository {
	return &SupportRepository{
		DB: db,
	}
}
