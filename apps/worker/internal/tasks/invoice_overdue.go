package tasks

import (
	"context"
	"errors"
	"fmt"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oewang/worker/internal/apiclient"
)

// TypeInvoiceDetectOverdue runs daily. There's no existing TS owner for
// this detection query (net-new feature) so Go runs it directly against
// Postgres; marking an invoice overdue (and any resulting notification)
// still happens in apps/api, unchanged.
const TypeInvoiceDetectOverdue = "invoices:detect_overdue"

// invoiceOverdueQuery finds invoices that are unpaid/sent, past due, and
// not soft-deleted.
const invoiceOverdueQuery = `SELECT id, workspace_id FROM invoices WHERE status IN ('unpaid','sent') AND due_date < now() AND deleted_at IS NULL`

// NewInvoiceOverdueTask builds the (payload-less) periodic task.
func NewInvoiceOverdueTask() (*asynq.Task, error) {
	return asynq.NewTask(TypeInvoiceDetectOverdue, nil), nil
}

// InvoiceOverdueHandler queries Postgres directly for overdue invoices and
// calls apps/api's internal POST /v1/internal/invoices/mark-overdue once
// per hit (which does exactly what a manual status-change PATCH does
// today, including the existing "Invoice Overdue" notification).
type InvoiceOverdueHandler struct {
	Pool           *pgxpool.Pool
	Client         *apiclient.Client
	APIInternalURL string
	WorkerAPIKey   string
}

func (h *InvoiceOverdueHandler) Handle(ctx context.Context, t *asynq.Task) error {
	rows, err := h.Pool.Query(ctx, invoiceOverdueQuery)
	if err != nil {
		return fmt.Errorf("tasks: query overdue invoices: %w", err)
	}
	defer rows.Close()

	var callErrs []error
	for rows.Next() {
		var invoiceID, workspaceID string
		if err := rows.Scan(&invoiceID, &workspaceID); err != nil {
			return fmt.Errorf("tasks: scan overdue invoice row: %w", err)
		}
		body := map[string]string{"invoice_id": invoiceID}
		if err := h.Client.Post(ctx, h.APIInternalURL, "/v1/internal/invoices/mark-overdue", h.WorkerAPIKey, body); err != nil {
			callErrs = append(callErrs, fmt.Errorf("mark-overdue for invoice %s: %w", invoiceID, err))
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("tasks: iterate overdue invoice rows: %w", err)
	}
	if len(callErrs) > 0 {
		return errors.Join(callErrs...)
	}
	return nil
}
