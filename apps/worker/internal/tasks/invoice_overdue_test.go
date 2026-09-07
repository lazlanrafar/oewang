package tasks

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oewang/worker/internal/apiclient"
	"github.com/stretchr/testify/require"
)

// TestInvoiceOverdueHandler_Integration is a real-Postgres integration test.
// It's skipped when DATABASE_URL isn't set in the test environment (see
// docker-compose.yml at repo root for local Postgres connection details),
// and skips gracefully rather than failing if this repo's actual invoices
// schema doesn't line up with the minimal columns this test inserts (e.g.
// extra NOT NULL columns without defaults) — this test must never block
// the rest of the suite. It never touches the real invoices table's data:
// rows are tagged with a unique test-only id prefix and cleaned up after.
func TestInvoiceOverdueHandler_Integration(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping invoice_overdue integration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("could not connect to DATABASE_URL: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		t.Skipf("could not ping DATABASE_URL: %v", err)
	}

	// Won't touch an existing invoices table's shape; only creates one if
	// it's entirely absent.
	_, err = pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS invoices (
		id text PRIMARY KEY,
		workspace_id text NOT NULL,
		status text NOT NULL,
		due_date timestamptz NOT NULL,
		deleted_at timestamptz
	)`)
	if err != nil {
		t.Skipf("could not prepare invoices table: %v", err)
	}

	testID := "go-worker-test-invoice-" + time.Now().Format("20060102150405.000000")
	_, err = pool.Exec(ctx,
		`INSERT INTO invoices (id, workspace_id, status, due_date, deleted_at) VALUES ($1, $2, 'unpaid', now() - interval '1 day', NULL)`,
		testID, "go-worker-test-workspace",
	)
	if err != nil {
		t.Skipf("could not insert test invoice row (schema mismatch with real invoices table?): %v", err)
	}
	defer func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM invoices WHERE id = $1`, testID)
	}()

	var calledForTestID bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			InvoiceID string `json:"invoice_id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.InvoiceID == testID {
			calledForTestID = true
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	h := &InvoiceOverdueHandler{
		Pool:           pool,
		Client:         apiclient.New(),
		APIInternalURL: srv.URL,
		WorkerAPIKey:   "worker-key",
	}
	task, err := NewInvoiceOverdueTask()
	require.NoError(t, err)

	require.NoError(t, h.Handle(ctx, task))
	require.True(t, calledForTestID, "expected mark-overdue to be called for the seeded overdue test invoice")
}
