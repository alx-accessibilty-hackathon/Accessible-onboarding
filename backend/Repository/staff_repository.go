package repository

import "github.com/jackc/pgx/v5/pgxpool"

// StaffRepository handles staff accounts (partner staff, employers, support, admin).
// Table: staff_users.
type StaffRepository struct {
	DB *pgxpool.Pool
}

func NewStaffRepo(db *pgxpool.Pool) *StaffRepository {
	return &StaffRepository{
		DB: db,
	}
}
