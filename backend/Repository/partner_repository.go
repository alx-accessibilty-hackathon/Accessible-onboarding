package repository

import "github.com/jackc/pgx/v5/pgxpool"

// PartnerRepository reads partners (platforms like Savanna, referral organisations like AAAPD)
// and employers. Tables: partners, employers.
type PartnerRepository struct {
	DB *pgxpool.Pool
}

func NewPartnerRepo(db *pgxpool.Pool) *PartnerRepository {
	return &PartnerRepository{
		DB: db,
	}
}


