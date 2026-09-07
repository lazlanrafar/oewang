package tasks

import (
	"context"

	"github.com/hibiken/asynq"
	"github.com/oewang/worker/internal/apiclient"
)

// TypeBillingLifecycle runs daily, calling apps/api's billing lifecycle
// service (renewals, downgrades, etc.) unchanged — business math for
// billing stays in TS, Go only schedules the call.
const TypeBillingLifecycle = "billing:process_lifecycle"

// NewBillingLifecycleTask builds the (payload-less) periodic task.
func NewBillingLifecycleTask() (*asynq.Task, error) {
	return asynq.NewTask(TypeBillingLifecycle, nil), nil
}

// BillingLifecycleHandler calls apps/api's internal
// POST /v1/internal/billing/process-lifecycle endpoint.
type BillingLifecycleHandler struct {
	Client         *apiclient.Client
	APIInternalURL string
	WorkerAPIKey   string
}

// Handle implements asynq.HandlerFunc's signature via ServeMux.HandleFunc.
func (h *BillingLifecycleHandler) Handle(ctx context.Context, t *asynq.Task) error {
	return h.Client.Post(ctx, h.APIInternalURL, "/v1/internal/billing/process-lifecycle", h.WorkerAPIKey, nil)
}
