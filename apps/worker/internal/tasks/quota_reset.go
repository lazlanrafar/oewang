package tasks

import (
	"context"

	"github.com/hibiken/asynq"
	"github.com/oewang/worker/internal/apiclient"
)

// TypeQuotaResetAll runs daily (the check cadence — apps/ai's own
// _add_monthly_reset logic decides whether a given workspace's reset
// actually fires this run, once/workspace/month).
const TypeQuotaResetAll = "ai:quota_reset_all"

// NewQuotaResetAllTask builds the (payload-less) periodic task.
func NewQuotaResetAllTask() (*asynq.Task, error) {
	return asynq.NewTask(TypeQuotaResetAll, nil), nil
}

// QuotaResetAllHandler calls apps/ai's internal
// POST /internal/quota/reset-all endpoint.
type QuotaResetAllHandler struct {
	Client          *apiclient.Client
	AIServiceURL    string
	AIServiceAPIKey string
}

func (h *QuotaResetAllHandler) Handle(ctx context.Context, t *asynq.Task) error {
	return h.Client.Post(ctx, h.AIServiceURL, "/internal/quota/reset-all", h.AIServiceAPIKey, nil)
}
