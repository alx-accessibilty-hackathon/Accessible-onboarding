package repository

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// InitializeDB connects to PostgreSQL. The URL comes from config.Config.DatabaseURL.
func InitializeDB(databaseURL string) *pgxpool.Pool {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatal("unable to create database pool: ", err)
	}
	if err := pool.Ping(ctx); err != nil {
		log.Fatal("unable to reach the database: ", err)
	}

	log.Println("connected to PostgreSQL")
	return pool
}
