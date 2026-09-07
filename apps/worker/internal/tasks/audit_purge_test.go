package tasks

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAuditPurgeCountSQL(t *testing.T) {
	assert.Equal(t, `SELECT count(*) FROM audit_logs WHERE created_at < $1`, auditPurgeCountSQL())
}

func TestAuditPurgeDeleteSQL(t *testing.T) {
	assert.Equal(t, `DELETE FROM audit_logs WHERE created_at < $1`, auditPurgeDeleteSQL())
}

func TestAuditPurgeDryRun_IsCurrentlyOn(t *testing.T) {
	// Ship dry-run only: this must stay true until a retention window is
	// explicitly approved. If this test fails, someone flipped the switch —
	// make sure that was an intentional, approved change.
	assert.True(t, auditPurgeDryRun)
}

// fakePurgePool implements PurgePool for tests: QueryRow always returns the
// configured count, and Exec records whether it was ever called (it must
// never be called while auditPurgeDryRun is true).
type fakePurgePool struct {
	count      int64
	execCalled bool
}

type fakeRow struct{ count int64 }

func (r fakeRow) Scan(dest ...any) error {
	*(dest[0].(*int64)) = r.count
	return nil
}

func (p *fakePurgePool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return fakeRow{count: p.count}
}

func (p *fakePurgePool) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	p.execCalled = true
	return pgconn.NewCommandTag(""), nil
}

func TestAuditPurgeHandler_DryRun_NeverCallsExec(t *testing.T) {
	pool := &fakePurgePool{count: 42}
	h := &AuditPurgeHandler{Pool: pool}

	err := h.Handle(context.Background(), nil)
	require.NoError(t, err)
	assert.False(t, pool.execCalled, "dry-run mode must never call Exec (never issue a DELETE)")
}
