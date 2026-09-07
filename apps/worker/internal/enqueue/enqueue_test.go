package enqueue

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hibiken/asynq"
	"github.com/oewang/worker/internal/tasks"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeEnqueuer records the last task it was asked to enqueue.
type fakeEnqueuer struct {
	lastTask *asynq.Task
	called   int
	err      error
}

func (f *fakeEnqueuer) Enqueue(task *asynq.Task, opts ...asynq.Option) (*asynq.TaskInfo, error) {
	f.called++
	f.lastTask = task
	if f.err != nil {
		return nil, f.err
	}
	return &asynq.TaskInfo{}, nil
}

func newTestServer(t *testing.T, enq Enqueuer, apiKey string) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /internal/enqueue/{kind}", Handler(enq, apiKey))
	return httptest.NewServer(mux)
}

func TestBuildTask_TelegramWebhook(t *testing.T) {
	body, err := json.Marshal(map[string]any{"update_id": 99, "raw_body": map[string]string{"a": "b"}})
	require.NoError(t, err)

	task, err := buildTask("telegram-webhook", body)
	require.NoError(t, err)
	assert.Equal(t, tasks.TypeTelegramWebhookProcess, task.Type())
}

func TestBuildTask_MayarWebhook(t *testing.T) {
	body, err := json.Marshal(map[string]any{"body": map[string]string{"a": "b"}, "token": "tok"})
	require.NoError(t, err)

	task, err := buildTask("mayar-webhook", body)
	require.NoError(t, err)
	assert.Equal(t, tasks.TypeMayarWebhookProcess, task.Type())
}

func TestBuildTask_TransactionsImport(t *testing.T) {
	body, err := json.Marshal(map[string]any{
		"workspace_id": "ws-1", "user_id": "u-1", "data": "base64data", "mime_type": "text/csv",
	})
	require.NoError(t, err)

	task, err := buildTask("transactions-import", body)
	require.NoError(t, err)
	assert.Equal(t, tasks.TypeTransactionsImport, task.Type())

	var payload tasks.TransactionsImportPayload
	require.NoError(t, json.Unmarshal(task.Payload(), &payload))
	assert.Equal(t, "ws-1", payload.WorkspaceID)
	assert.Equal(t, "u-1", payload.UserID)
	assert.Equal(t, "base64data", payload.Data)
	assert.Equal(t, "text/csv", payload.MimeType)
}

func TestBuildTask_UnknownKind(t *testing.T) {
	_, err := buildTask("something-else", []byte(`{}`))
	require.Error(t, err)
	assert.ErrorIs(t, err, errUnknownKind)
}

func TestHandler_401OnMissingKey(t *testing.T) {
	enq := &fakeEnqueuer{}
	srv := newTestServer(t, enq, "expected-key")
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/internal/enqueue/telegram-webhook", "application/json", strings.NewReader(`{}`))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	assert.Equal(t, 0, enq.called)
}

func TestHandler_401OnWrongKey(t *testing.T) {
	enq := &fakeEnqueuer{}
	srv := newTestServer(t, enq, "expected-key")
	defer srv.Close()

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/internal/enqueue/telegram-webhook", strings.NewReader(`{}`))
	req.Header.Set("x-api-key", "wrong-key")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	assert.Equal(t, 0, enq.called)
}

func TestHandler_FailsClosedWhenExpectedKeyUnset(t *testing.T) {
	enq := &fakeEnqueuer{}
	srv := newTestServer(t, enq, "") // WORKER_API_KEY unset
	defer srv.Close()

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/internal/enqueue/telegram-webhook", strings.NewReader(`{}`))
	req.Header.Set("x-api-key", "anything")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "empty expected key must reject everything, never disable the gate")
}

func TestHandler_400OnUnknownKind(t *testing.T) {
	enq := &fakeEnqueuer{}
	srv := newTestServer(t, enq, "expected-key")
	defer srv.Close()

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/internal/enqueue/bogus-kind", strings.NewReader(`{}`))
	req.Header.Set("x-api-key", "expected-key")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.Equal(t, 0, enq.called)
}

func TestHandler_EnqueuesTelegramWebhook(t *testing.T) {
	enq := &fakeEnqueuer{}
	srv := newTestServer(t, enq, "expected-key")
	defer srv.Close()

	body, _ := json.Marshal(map[string]any{"update_id": 7, "raw_body": map[string]string{"x": "y"}})
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/internal/enqueue/telegram-webhook", strings.NewReader(string(body)))
	req.Header.Set("x-api-key", "expected-key")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, 1, enq.called)
	assert.Equal(t, tasks.TypeTelegramWebhookProcess, enq.lastTask.Type())
}

func TestHandler_EnqueuesMayarWebhook(t *testing.T) {
	enq := &fakeEnqueuer{}
	srv := newTestServer(t, enq, "expected-key")
	defer srv.Close()

	body, _ := json.Marshal(map[string]any{"body": map[string]string{"x": "y"}, "token": "tok"})
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/internal/enqueue/mayar-webhook", strings.NewReader(string(body)))
	req.Header.Set("x-api-key", "expected-key")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, 1, enq.called)
	assert.Equal(t, tasks.TypeMayarWebhookProcess, enq.lastTask.Type())
}

func TestHandler_EnqueuesTransactionsImport(t *testing.T) {
	enq := &fakeEnqueuer{}
	srv := newTestServer(t, enq, "expected-key")
	defer srv.Close()

	body, _ := json.Marshal(map[string]any{
		"workspace_id": "ws-1", "user_id": "u-1", "data": "base64data", "mime_type": "text/csv",
	})
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/internal/enqueue/transactions-import", strings.NewReader(string(body)))
	req.Header.Set("x-api-key", "expected-key")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, 1, enq.called)
	assert.Equal(t, tasks.TypeTransactionsImport, enq.lastTask.Type())
}
