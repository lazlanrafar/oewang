package tasks

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/hibiken/asynq"
	"github.com/oewang/worker/internal/apiclient"
)

// TypeMayarWebhookProcess is enqueued on demand (not periodic), one per
// incoming Mayar payment webhook (after apps/api has already synchronously
// verified the token, so a bad signature still gets a fast 401 without
// ever reaching this queue).
const TypeMayarWebhookProcess = "webhook:mayar_process"

// MayarWebhookPayload carries the raw webhook body and token through to
// apps/api's internal processing endpoint unchanged.
type MayarWebhookPayload struct {
	Body  json.RawMessage `json:"body"`
	Token string          `json:"token"`
}

// NewMayarWebhookTask builds the task for one Mayar webhook delivery.
func NewMayarWebhookTask(body json.RawMessage, token string) (*asynq.Task, error) {
	payload, err := json.Marshal(MayarWebhookPayload{Body: body, Token: token})
	if err != nil {
		return nil, fmt.Errorf("tasks: encode mayar webhook payload: %w", err)
	}
	return asynq.NewTask(
		TypeMayarWebhookProcess, payload,
		asynq.Queue("critical"), // webhook processing: high priority, weighted above periodic "default" batch jobs
	), nil
}

// MayarWebhookHandler calls apps/api's internal
// POST /v1/internal/mayar/process-webhook endpoint, forwarding
// {body, token} unchanged.
type MayarWebhookHandler struct {
	Client         *apiclient.Client
	APIInternalURL string
	WorkerAPIKey   string
}

func (h *MayarWebhookHandler) Handle(ctx context.Context, t *asynq.Task) error {
	var payload MayarWebhookPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("tasks: decode mayar webhook payload: %w", err)
	}
	return h.Client.Post(ctx, h.APIInternalURL, "/v1/internal/mayar/process-webhook", h.WorkerAPIKey, payload)
}
