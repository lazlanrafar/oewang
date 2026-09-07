// Package enqueue implements POST /internal/enqueue/{kind}, the HTTP
// endpoint apps/api calls to hand a webhook payload off to this worker's
// asynq queue. asynq's wire format (msgpack over specific Redis keys) has
// no official JS client, so apps/api never talks to Redis directly for
// this — it just calls this plain HTTP endpoint, and the only place that
// understands asynq's wire format stays Go-side.
package enqueue

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/hibiken/asynq"
	"github.com/oewang/worker/internal/tasks"
)

// errUnknownKind is returned by buildTask for any :kind other than
// "telegram-webhook" or "mayar-webhook".
var errUnknownKind = errors.New("enqueue: unknown kind")

// telegramWebhookRequest is the body shape for kind=telegram-webhook.
type telegramWebhookRequest struct {
	UpdateID int64           `json:"update_id"`
	RawBody  json.RawMessage `json:"raw_body"`
}

// mayarWebhookRequest is the body shape for kind=mayar-webhook.
type mayarWebhookRequest struct {
	Body  json.RawMessage `json:"body"`
	Token string          `json:"token"`
}

// transactionsImportRequest is the body shape for kind=transactions-import.
type transactionsImportRequest struct {
	JobID       string `json:"job_id"`
	WorkspaceID string `json:"workspace_id"`
	UserID      string `json:"user_id"`
	Data        string `json:"data"`
	MimeType    string `json:"mime_type"`
}

// buildTask decides which asynq.Task to build for a given :kind + request
// body. It's a pure function (no asynq client, no Redis) so the "which
// task to build" decision is unit-testable on its own.
func buildTask(kind string, body []byte) (*asynq.Task, error) {
	switch kind {
	case "telegram-webhook":
		var req telegramWebhookRequest
		if err := json.Unmarshal(body, &req); err != nil {
			return nil, fmt.Errorf("enqueue: decode telegram-webhook body: %w", err)
		}
		return tasks.NewTelegramWebhookTask(req.RawBody, req.UpdateID)
	case "mayar-webhook":
		var req mayarWebhookRequest
		if err := json.Unmarshal(body, &req); err != nil {
			return nil, fmt.Errorf("enqueue: decode mayar-webhook body: %w", err)
		}
		return tasks.NewMayarWebhookTask(req.Body, req.Token)
	case "transactions-import":
		var req transactionsImportRequest
		if err := json.Unmarshal(body, &req); err != nil {
			return nil, fmt.Errorf("enqueue: decode transactions-import body: %w", err)
		}
		return tasks.NewTransactionsImportTask(tasks.TransactionsImportPayload{
			JobID: req.JobID, WorkspaceID: req.WorkspaceID, UserID: req.UserID, Data: req.Data, MimeType: req.MimeType,
		})
	default:
		return nil, fmt.Errorf("%w: %q", errUnknownKind, kind)
	}
}

// Enqueuer is the narrow *asynq.Client surface this handler needs. Kept as
// an interface so tests can inject a fake instead of needing a live Redis.
type Enqueuer interface {
	Enqueue(task *asynq.Task, opts ...asynq.Option) (*asynq.TaskInfo, error)
}

// Handler returns the http.HandlerFunc for POST /internal/enqueue/{kind}.
// Fails closed exactly like apps/api's internal-controller pattern: if
// workerAPIKey is unset, every request is rejected — the gate is never
// silently disabled.
func Handler(client Enqueuer, workerAPIKey string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if workerAPIKey == "" || r.Header.Get("x-api-key") != workerAPIKey {
			writeJSONError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		kind := r.PathValue("kind")
		body, err := io.ReadAll(r.Body)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "could not read request body")
			return
		}

		task, err := buildTask(kind, body)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}

		if _, err := client.Enqueue(task); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "could not enqueue task")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]bool{"enqueued": true})
	}
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
