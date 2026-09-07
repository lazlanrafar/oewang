package tasks

import (
	"context"
	"strconv"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSoftDeletedCountSQL_PerTable(t *testing.T) {
	for _, table := range softDeletedPurgeTables {
		got := softDeletedCountSQL(table)
		want := `SELECT count(*) FROM ` + table + ` WHERE deleted_at IS NOT NULL AND deleted_at < $1`
		assert.Equal(t, want, got)
	}
}

func TestSoftDeletedBatchDeleteSQL_PerTable(t *testing.T) {
	for _, table := range softDeletedPurgeTables {
		got := softDeletedBatchDeleteSQL(table)
		want := `DELETE FROM ` + table + ` WHERE id IN (SELECT id FROM ` + table + ` WHERE deleted_at IS NOT NULL AND deleted_at < $1 LIMIT 500)`
		assert.Equal(t, want, got)
	}
}

func TestSoftDeletedPurgeDryRun_IsCurrentlyOn(t *testing.T) {
	assert.True(t, softDeletedPurgeDryRun)
}

func TestSoftDeletedPurgeHandler_DryRun_NeverCallsExec(t *testing.T) {
	pool := &fakePurgePool{count: 7}
	h := &SoftDeletedPurgeHandler{Pool: pool}

	err := h.Handle(context.Background(), nil)
	require.NoError(t, err)
	assert.False(t, pool.execCalled, "dry-run mode must never call Exec (never issue a DELETE)")
}

// batchedFakePool simulates a table where successive batch deletes affect
// 500, 500, then 200 rows before returning 0 — verifying runBatchedDelete
// stops exactly when a batch affects zero rows, and sums correctly.
type batchedFakePool struct {
	batches   []int64
	callCount int
}

func (p *batchedFakePool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return nil // unused by runBatchedDelete
}

func (p *batchedFakePool) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	affected := int64(0)
	if p.callCount < len(p.batches) {
		affected = p.batches[p.callCount]
	}
	p.callCount++
	return pgconn.NewCommandTag(commandTagFor(affected)), nil
}

func commandTagFor(affected int64) string {
	// pgconn.NewCommandTag parses "<verb> <rows>" style strings for
	// RowsAffected(); DELETE's format is "DELETE <rows>".
	return "DELETE " + strconv.FormatInt(affected, 10)
}

func TestRunBatchedDelete_StopsAtZeroAndSums(t *testing.T) {
	pool := &batchedFakePool{batches: []int64{500, 500, 200}}

	total, err := runBatchedDelete(context.Background(), pool, "DELETE FROM x WHERE ... LIMIT 500", time.Now())
	require.NoError(t, err)
	assert.Equal(t, int64(1200), total)
	assert.Equal(t, 4, pool.callCount, "expected 3 non-empty batches + 1 terminating zero-row batch")
}
