package repository

import "github.com/jackc/pgx/v5/pgxpool"

// SessionRepository stores sign-in sessions for learners, staff and partner servers.
// Only token hashes are stored. Table: auth_sessions.
type SessionRepository struct {
	DB *pgxpool.Pool
}

func NewSessionRepo(db *pgxpool.Pool) *SessionRepository {
	return &SessionRepository{
		DB: db,
	}
}
