package repository

import "github.com/jackc/pgx/v5/pgxpool"

// ApplicationRepository handles job applications.
// Table: applications.
type ApplicationRepository struct {
	DB *pgxpool.Pool
}

func NewApplicationRepo(db *pgxpool.Pool) *ApplicationRepository {
	return &ApplicationRepository{
		DB: db,
	}
}
