package repository

import "github.com/jackc/pgx/v5/pgxpool"

// JobRepository handles job postings and their accommodation codes.
// Table: jobs.
type JobRepository struct {
	DB *pgxpool.Pool
}

func NewJobRepo(db *pgxpool.Pool) *JobRepository {
	return &JobRepository{
		DB: db,
	}
}
