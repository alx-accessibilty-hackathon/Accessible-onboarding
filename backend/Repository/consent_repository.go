package repository

import "github.com/jackc/pgx/v5/pgxpool"

// ConsentRepository records consents (data use, cloud speech, SMS, partner access).
// Table: consents.
type ConsentRepository struct {
	DB *pgxpool.Pool
}

func NewConsentRepo(db *pgxpool.Pool) *ConsentRepository {
	return &ConsentRepository{
		DB: db,
	}
}
