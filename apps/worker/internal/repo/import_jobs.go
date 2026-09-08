package repo

import (
	"context"
)

// ImportJobsRepo writes to apps/api's transaction_import_jobs table
// (packages/database/schema/transaction-import-jobs.ts). apps/api creates
// the row (status "pending") at enqueue time; the worker is the only writer
// of the pending -> succeeded/failed transition, matching the
// direct-Postgres-write pattern used elsewhere in this service.
type ImportJobsRepo struct {
	Pool Pool
}

// MarkSucceeded records a completed import (including "0 rows found", which
// is a successful run, not a failure).
func (r *ImportJobsRepo) MarkSucceeded(ctx context.Context, jobID string, imported, skipped int) error {
	const q = `
		UPDATE transaction_import_jobs
		SET status = 'succeeded', imported = $2, skipped = $3, updated_at = now()
		WHERE id = $1`
	_, err := r.Pool.Exec(ctx, q, jobID, imported, skipped)
	return err
}

// MarkFailed records a terminal failure (asynq retries exhausted).
func (r *ImportJobsRepo) MarkFailed(ctx context.Context, jobID string, errMsg string) error {
	const q = `
		UPDATE transaction_import_jobs
		SET status = 'failed', error = $2, updated_at = now()
		WHERE id = $1`
	_, err := r.Pool.Exec(ctx, q, jobID, errMsg)
	return err
}
