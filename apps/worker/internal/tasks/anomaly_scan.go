package tasks

import (
	"context"

	"github.com/hibiken/asynq"
	"github.com/oewang/worker/internal/apiclient"
)

// TypeAnomalyScanAll matches the cadence of ANOMALY_SCAN_HOURS. Only
// registered as a periodic entry when that config value is > 0 — mirrors
// apps/ai/app/config.py's ANOMALY_SCAN_HOURS: int = 0 (0 = disabled,
// opt-in). See cmd/worker/main.go for the registration guard.
const TypeAnomalyScanAll = "anomaly:scan_all"

// NewAnomalyScanAllTask builds the (payload-less) periodic task.
func NewAnomalyScanAllTask() (*asynq.Task, error) {
	return asynq.NewTask(TypeAnomalyScanAll, nil), nil
}

// AnomalyScanAllHandler calls apps/ai's internal
// POST /internal/anomaly/scan-all endpoint (wraps scan_all_workspaces()
// unchanged — this replaces the in-process AsyncIOScheduler in apps/ai's
// main.py, which only worked correctly for a single replica).
type AnomalyScanAllHandler struct {
	Client          *apiclient.Client
	AIServiceURL    string
	AIServiceAPIKey string
}

func (h *AnomalyScanAllHandler) Handle(ctx context.Context, t *asynq.Task) error {
	return h.Client.Post(ctx, h.AIServiceURL, "/internal/anomaly/scan-all", h.AIServiceAPIKey, nil)
}
