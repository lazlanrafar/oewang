// Package db owns the single pgxpool.Pool instance apps/worker's Postgres-
// touching task handlers share (invoice_overdue, audit_purge,
// soft_deleted_purge). Everything else calls existing TS/Python services
// over internal HTTP instead of touching Postgres directly.
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool opens a pgxpool against databaseURL. Pool size is small (~5
// connections) matching apps/ai's own asyncpg pool sizing — this worker is
// I/O-bound, not connection-hungry.
func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("db: parse DATABASE_URL: %w", err)
	}
	cfg.MaxConns = 5

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("db: create pool: %w", err)
	}
	return pool, nil
}
