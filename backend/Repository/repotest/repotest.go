// Package repotest gives tests a real, empty PostgreSQL database with every migration applied.
// Only test files import it.
package repotest

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// NewDB connects to TEST_DATABASE_URL, creates a new schema, applies the "-- +goose Up" part
// of every migration in it and drops it when the test ends, so tests never see each other's
// rows. Without TEST_DATABASE_URL the test is skipped (CI has no database yet).
//
//	TEST_DATABASE_URL=postgres://postgres@localhost:5432/bridge_test?sslmode=disable go test ./...
func NewDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL is not set: skipping the database test")
	}
	ctx := context.Background()
	schema := "test_" + strings.ReplaceAll(uuid.NewString(), "-", "")

	admin, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatalf("connect to TEST_DATABASE_URL: %v", err)
	}
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "DROP SCHEMA "+schema+" CASCADE")
		_ = admin.Close(context.Background())
	})

	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatalf("parse TEST_DATABASE_URL: %v", err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("open pool: %v", err)
	}
	t.Cleanup(pool.Close)

	for _, file := range migrationFiles(t) {
		sql, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}
		if _, err := pool.Exec(ctx, upSection(string(sql))); err != nil {
			t.Fatalf("apply %s: %v", filepath.Base(file), err)
		}
	}
	return pool
}

// migrationFiles lists backend/migrations/*.sql in order, wherever the test runs from.
func migrationFiles(t *testing.T) []string {
	t.Helper()
	_, here, _, _ := runtime.Caller(0) // .../backend/Repository/repotest/repotest.go
	dir := filepath.Join(filepath.Dir(here), "..", "..", "migrations")
	files, err := filepath.Glob(filepath.Join(dir, "*.sql"))
	if err != nil || len(files) == 0 {
		t.Fatalf("no migrations found in %s", dir)
	}
	sort.Strings(files)
	return files
}

// upSection returns the SQL between "-- +goose Up" and "-- +goose Down".
func upSection(sql string) string {
	if i := strings.Index(sql, "-- +goose Up"); i >= 0 {
		sql = sql[i:]
	}
	if i := strings.Index(sql, "-- +goose Down"); i >= 0 {
		sql = sql[:i]
	}
	return sql
}
