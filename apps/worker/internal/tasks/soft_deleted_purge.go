package tasks

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/hibiken/asynq"
)

// TypeSoftDeletedPurge runs weekly. Owned directly in Go — nothing exists
// today to purge soft-deleted rows across tables.
const TypeSoftDeletedPurge = "retention:purge_soft_deleted"

// softDeletedPurgeDryRun gates real deletion, same reasoning as
// auditPurgeDryRun: a retention window hasn't been explicitly approved
// yet, so this is a one-time approval gate (literal), not a runtime
// toggle. Flip to false only once approved.
const softDeletedPurgeDryRun = true

// softDeletedRetention is a conservative placeholder default (1 year),
// pending an explicit retention-policy decision — same caveat as
// auditLogRetention.
const softDeletedRetention = 365 * 24 * time.Hour

// softDeletedBatchSize bounds how many rows a single DELETE touches, to
// bound lock time on larger tables.
const softDeletedBatchSize = 500

// softDeletedPurgeTables is a non-exhaustive placeholder list; expand to
// the full ~31 tables with deleted_at before enabling this in prod.
var softDeletedPurgeTables = []string{
	"transactions",
	"invoices",
	"contacts",
	"categories",
	"wallets",
	"debts",
}

// softDeletedCountSQL and softDeletedBatchDeleteSQL are pure string
// builders, kept separate from any pgx execution call so the query text
// itself (and the per-table substitution) is unit-testable without a
// database. table is never external input — it only ever comes from the
// fixed softDeletedPurgeTables slice above, so direct interpolation is
// safe here (never wire this to any external/user-supplied value).
func softDeletedCountSQL(table string) string {
	return fmt.Sprintf(`SELECT count(*) FROM %s WHERE deleted_at IS NOT NULL AND deleted_at < $1`, table)
}

func softDeletedBatchDeleteSQL(table string) string {
	return fmt.Sprintf(
		`DELETE FROM %s WHERE id IN (SELECT id FROM %s WHERE deleted_at IS NOT NULL AND deleted_at < $1 LIMIT %d)`,
		table, table, softDeletedBatchSize,
	)
}

// NewSoftDeletedPurgeTask builds the (payload-less) periodic task.
func NewSoftDeletedPurgeTask() (*asynq.Task, error) {
	return asynq.NewTask(TypeSoftDeletedPurge, nil), nil
}

// SoftDeletedPurgeHandler purges (or, while softDeletedPurgeDryRun is
// true, only counts and logs) soft-deleted rows older than
// softDeletedRetention, per table in softDeletedPurgeTables.
type SoftDeletedPurgeHandler struct {
	Pool PurgePool
}

func (h *SoftDeletedPurgeHandler) Handle(ctx context.Context, t *asynq.Task) error {
	cutoff := time.Now().Add(-softDeletedRetention)

	for _, table := range softDeletedPurgeTables {
		var count int64
		if err := h.Pool.QueryRow(ctx, softDeletedCountSQL(table), cutoff).Scan(&count); err != nil {
			return fmt.Errorf("tasks: count soft-deleted rows in %s: %w", table, err)
		}

		if softDeletedPurgeDryRun {
			log.Printf("soft_deleted_purge: dry-run, table=%s would delete %d rows with deleted_at < %s", table, count, cutoff.Format(time.RFC3339))
			continue
		}

		// Not exercised while softDeletedPurgeDryRun is true — kept here so
		// flipping the const above is the only change needed to enable
		// real deletion.
		total, err := runBatchedDelete(ctx, h.Pool, softDeletedBatchDeleteSQL(table), cutoff)
		if err != nil {
			return fmt.Errorf("tasks: batched delete on %s: %w", table, err)
		}
		log.Printf("soft_deleted_purge: table=%s deleted %d rows with deleted_at < %s", table, total, cutoff.Format(time.RFC3339))
	}
	return nil
}

// runBatchedDelete repeatedly executes deleteSQL (a bounded-LIMIT batch
// delete) until a batch affects zero rows, returning the total rows
// deleted. Split out from Handle so the loop-termination behavior is
// unit-testable independent of the dry-run gate above.
func runBatchedDelete(ctx context.Context, pool PurgePool, deleteSQL string, cutoff time.Time) (int64, error) {
	var total int64
	for {
		tag, err := pool.Exec(ctx, deleteSQL, cutoff)
		if err != nil {
			return total, err
		}
		affected := tag.RowsAffected()
		total += affected
		if affected == 0 {
			break
		}
	}
	return total, nil
}
