package tasks

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oewang/worker/internal/apiclient"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBillingLifecycleHandler_PostsWithAPIKey(t *testing.T) {
	var gotPath, gotKey string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotKey = r.Header.Get("x-api-key")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	h := &BillingLifecycleHandler{Client: apiclient.New(), APIInternalURL: srv.URL, WorkerAPIKey: "worker-key"}
	task, err := NewBillingLifecycleTask()
	require.NoError(t, err)

	err = h.Handle(context.Background(), task)
	require.NoError(t, err)
	assert.Equal(t, "/v1/internal/billing/process-lifecycle", gotPath)
	assert.Equal(t, "worker-key", gotKey)
}

func TestBillingLifecycleHandler_NonSuccessSurfacesAsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	h := &BillingLifecycleHandler{Client: apiclient.New(), APIInternalURL: srv.URL, WorkerAPIKey: "worker-key"}
	task, err := NewBillingLifecycleTask()
	require.NoError(t, err)

	err = h.Handle(context.Background(), task)
	require.Error(t, err, "non-2xx should surface as an error so asynq retries")
}

func TestBillingLifecycleHandler_2xxIsSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	h := &BillingLifecycleHandler{Client: apiclient.New(), APIInternalURL: srv.URL, WorkerAPIKey: "worker-key"}
	task, _ := NewBillingLifecycleTask()

	err := h.Handle(context.Background(), task)
	require.NoError(t, err)
}
