package repository

import (
	"context"
	"encoding/json"
	"fmt"

	sqlc "bridge/Repository/sqlc"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SeedOptions: what `bridge seed` needs from main.go.
type SeedOptions struct {
	IfEmpty       bool                         // do nothing if partners already exist (safe to run on every start)
	StaffPassword string                       // password of every demo staff account
	ClientSecret  string                       // OAuth client secret of savanna-demo
	HashPassword  func(string) (string, error) // bcrypt (SecurityService.HashPassword)
	HashSecret    func(string) []byte          // SHA-256 (SecurityService.HashToken)
	Origins       []string                     // browser origins allowed to use the demo keys
}

// SeedResult says what was created, for the console output.
type SeedResult struct {
	Skipped bool
	Jobs    int
}

// DemoOrigins are the local addresses of the widget: Vite dev server, Vite preview, the API
// itself, and the Docker web container.
var DemoOrigins = []string{
	"http://localhost:5173", "http://127.0.0.1:5173",
	"http://localhost:4173", "http://127.0.0.1:4173",
	"http://localhost:8080", "http://localhost:8081",
}

// Seed adds the demo data in one transaction: two platform partners (pk_demo_savanna,
// pk_demo_jobboard), the referral organisation AAAPD, the employer "Example Co", four staff
// accounts and 6 published demo jobs.
func Seed(ctx context.Context, db *pgxpool.Pool, opt SeedOptions) (*SeedResult, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) // does nothing after Commit

	if opt.IfEmpty {
		var n int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM partners`).Scan(&n); err != nil {
			return nil, err
		}
		if n > 0 {
			return &SeedResult{Skipped: true}, nil
		}
	}

	widgetConfig, _ := json.Marshal(map[string]any{
		"languages":        []string{"am", "en"},
		"default_language": "am",
		"id_routes":        []string{"fayda", "kebele_id", "refugee_id", "unhcr_proof", "other_document", "none"},
		"help":             map[string]any{"phone": "+251 11 000 0000", "telegram": "@bridge_help_demo"},
		"theme":            map[string]any{"primary": "#cc3636"},
	})

	insertPartner := func(slug, name, kind, key string, clientID *string, secretHash []byte) (uuid.UUID, error) {
		var id uuid.UUID
		err := tx.QueryRow(ctx, `
			INSERT INTO partners (slug, name, kind, publishable_key, allowed_origins, client_id, client_secret_hash, config)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
			slug, name, kind, key, opt.Origins, clientID, secretHash, widgetConfig).Scan(&id)
		if err != nil {
			return uuid.Nil, fmt.Errorf("partner %s: %w", slug, err)
		}
		return id, nil
	}

	clientID := "savanna-demo"
	savanna, err := insertPartner("savanna", "Savanna (demo)", "platform", "pk_demo_savanna", &clientID, opt.HashSecret(opt.ClientSecret))
	if err != nil {
		return nil, err
	}
	if _, err := insertPartner("jobboard", "Job board (demo)", "platform", "pk_demo_jobboard", nil, nil); err != nil {
		return nil, err
	}
	aaapd, err := insertPartner("aaapd", "AAAPD", "referral_org", "pk_demo_aaapd", nil, nil)
	if err != nil {
		return nil, err
	}

	var employer uuid.UUID
	if err := tx.QueryRow(ctx, `INSERT INTO employers (name) VALUES ('Example Co') RETURNING id`).Scan(&employer); err != nil {
		return nil, err
	}

	hash, err := opt.HashPassword(opt.StaffPassword)
	if err != nil {
		return nil, err
	}
	staff := []struct {
		email, name, role  string
		partner, employerP *uuid.UUID
	}{
		{"employer@example.org", "Example Co HR", "employer", nil, &employer},
		{"staff@aaapd.example", "AAAPD staff", "partner_staff", &aaapd, nil},
		{"staff@savanna.example", "Savanna staff", "partner_staff", &savanna, nil},
		{"support@example.org", "Support team", "support", nil, nil},
		{"admin@example.org", "Admin", "admin", nil, nil},
	}
	for _, s := range staff {
		if _, err := tx.Exec(ctx, `
			INSERT INTO staff_users (email, password_hash, display_name, role, partner_id, employer_id)
			VALUES ($1, $2, $3, $4, $5, $6)`, s.email, hash, s.name, s.role, s.partner, s.employerP); err != nil {
			return nil, fmt.Errorf("staff %s: %w", s.email, err)
		}
	}

	if err := SeedJobs(ctx, sqlc.New(tx), employer); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &SeedResult{Jobs: len(demoJobs)}, nil
}
