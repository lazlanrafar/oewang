package tasks

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// TypeAuditPurge runs weekly. Owned directly in Go — nothing exists today
// to purge audit_logs.
const TypeAuditPurge = "retention:purge_audit_logs"

// auditPurgeDryRun gates real deletion. Ship dry-run only: this is a
// one-time approval gate (a retention window hasn't been explicitly
// decided by the user yet), not an operational switch — so it's a literal,
// not an env var/config flag. Flip this single bool to false only once a
// retention window is explicitly approved.
const auditPurgeDryRun = true

// auditLogRetention is a conservative placeholder default (1 year),
// pending an explicit retention-policy decision. Not yet an approved
// policy — just a sane number to log against while dry-run is on.
const auditLogRetention = 365 * 24 * time.Hour

// PurgePool is the narrow pgxpool.Pool surface the purge handlers need
// (count via QueryRow, delete via Exec). Kept as an interface so tests can
// inject a fake without a live Postgres connection.
type PurgePool interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// auditPurgeCountSQL and auditPurgeDeleteSQL are pure string builders kept
// separate from any pgx execution call so the query text itself is
// trivially unit-testable without a database.
func auditPurgeCountSQL() string {
	return `SELECT count(*) FROM audit_logs WHERE created_at < $1`
}

func auditPurgeDeleteSQL() string {
	return `DELETE FROM audit_logs WHERE created_at < $1`
}

// NewAuditPurgeTask builds the (payload-less) periodic task.
func NewAuditPurgeTask() (*asynq.Task, error) {
	return asynq.NewTask(TypeAuditPurge, nil), nil
}

// AuditPurgeHandler purges (or, while auditPurgeDryRun is true, only
// counts and logs) audit_logs rows older than auditLogRetention.
type AuditPurgeHandler struct {
	Pool PurgePool
}

func (h *AuditPurgeHandler) Handle(ctx context.Context, t *asynq.Task) error {
	cutoff := time.Now().Add(-auditLogRetention)

	var count int64
	if err := h.Pool.QueryRow(ctx, auditPurgeCountSQL(), cutoff).Scan(&count); err != nil {
		return fmt.Errorf("tasks: count audit_logs to purge: %w", err)
	}

	if auditPurgeDryRun {
		log.Printf("audit_purge: dry-run, would delete %d rows older than %s", count, cutoff.Format(time.RFC3339))
		return nil
	}

	// Not exercised while auditPurgeDryRun is true — kept here so flipping
	// the const above is the only change needed to enable real deletion.
	tag, err := h.Pool.Exec(ctx, auditPurgeDeleteSQL(), cutoff)
	if err != nil {
		return fmt.Errorf("tasks: delete audit_logs: %w", err)
	}
	log.Printf("audit_purge: deleted %d rows older than %s", tag.RowsAffected(), cutoff.Format(time.RFC3339))
	return nil
}
