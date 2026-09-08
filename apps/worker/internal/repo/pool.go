package repo

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Pool is the narrow pgxpool.Pool surface every repo in this package needs.
// Kept as an interface (same pattern as internal/tasks's PurgePool) so tests
// can inject pgxmock instead of a live Postgres connection. *pgxpool.Pool
// satisfies this directly — callers pass it in unchanged.
type Pool interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}
