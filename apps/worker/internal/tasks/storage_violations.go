package tasks

import (
	"context"

	"github.com/hibiken/asynq"
	"github.com/oewang/worker/internal/apiclient"
)

// TypeStorageViolations runs daily, calling apps/api's vault storage-
// violations processing unchanged.
const TypeStorageViolations = "vault:process_violations"

// NewStorageViolationsTask builds the (payload-less) periodic task.
func NewStorageViolationsTask() (*asynq.Task, error) {
	return asynq.NewTask(TypeStorageViolations, nil), nil
}

// StorageViolationsHandler calls apps/api's internal
// POST /v1/internal/vault/process-storage endpoint.
type StorageViolationsHandler struct {
	Client         *apiclient.Client
	APIInternalURL string
	WorkerAPIKey   string
}

func (h *StorageViolationsHandler) Handle(ctx context.Context, t *asynq.Task) error {
	return h.Client.Post(ctx, h.APIInternalURL, "/v1/internal/vault/process-storage", h.WorkerAPIKey, nil)
}
