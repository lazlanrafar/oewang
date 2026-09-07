package tasks

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oewang/worker/internal/apiclient"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMayarWebhookHandler_ForwardsBodyAndToken(t *testing.T) {
	var gotPath, gotKey string
	var gotBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotKey = r.Header.Get("x-api-key")
		gotBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	rawBody := json.RawMessage(`{"event":"payment.received"}`)
	task, err := NewMayarWebhookTask(rawBody, "tok123")
	require.NoError(t, err)

	h := &MayarWebhookHandler{Client: apiclient.New(), APIInternalURL: srv.URL, WorkerAPIKey: "worker-key"}
	err = h.Handle(context.Background(), task)
	require.NoError(t, err)

	assert.Equal(t, "/v1/internal/mayar/process-webhook", gotPath)
	assert.Equal(t, "worker-key", gotKey)

	var got MayarWebhookPayload
	require.NoError(t, json.Unmarshal(gotBody, &got))
	assert.Equal(t, "tok123", got.Token)
	assert.JSONEq(t, string(rawBody), string(got.Body))
}

func TestMayarWebhookHandler_NonSuccessSurfacesAsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	task, err := NewMayarWebhookTask(json.RawMessage(`{}`), "tok")
	require.NoError(t, err)

	h := &MayarWebhookHandler{Client: apiclient.New(), APIInternalURL: srv.URL, WorkerAPIKey: "worker-key"}
	err = h.Handle(context.Background(), task)
	require.Error(t, err)
}
