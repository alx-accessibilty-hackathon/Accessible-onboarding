package repository

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

// InitializeDB connects to PostgreSQL using DATABASE_URL.
func InitializeDB() *pgxpool.Pool {
	// Only load .env locally; in Docker the variables come from the environment.
	_ = godotenv.Load(".env")

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatal("unable to create database pool: ", err)
	}
	if err := pool.Ping(ctx); err != nil {
		log.Fatal("unable to reach the database: ", err)
	}

	return pool
}
