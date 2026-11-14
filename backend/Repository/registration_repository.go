package repository

import "github.com/jackc/pgx/v5/pgxpool"

// RegistrationRepository handles registrations and their answers
// (each answer has a version number for the "another device saved first" check).
// Tables: registrations, answers.
type RegistrationRepository struct {
	DB *pgxpool.Pool
}

func NewRegistrationRepo(db *pgxpool.Pool) *RegistrationRepository {
	return &RegistrationRepository{
		DB: db,
	}
}
