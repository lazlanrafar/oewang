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

func TestStorageViolationsHandler_PostsWithAPIKey(t *testing.T) {
	var gotPath, gotKey string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotKey = r.Header.Get("x-api-key")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	h := &StorageViolationsHandler{Client: apiclient.New(), APIInternalURL: srv.URL, WorkerAPIKey: "worker-key"}
	task, err := NewStorageViolationsTask()
	require.NoError(t, err)

	err = h.Handle(context.Background(), task)
	require.NoError(t, err)
	assert.Equal(t, "/v1/internal/vault/process-storage", gotPath)
	assert.Equal(t, "worker-key", gotKey)
}

func TestStorageViolationsHandler_NonSuccessSurfacesAsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	h := &StorageViolationsHandler{Client: apiclient.New(), APIInternalURL: srv.URL, WorkerAPIKey: "worker-key"}
	task, _ := NewStorageViolationsTask()

	err := h.Handle(context.Background(), task)
	require.Error(t, err)
}

func TestStorageViolationsHandler_2xxIsSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	h := &StorageViolationsHandler{Client: apiclient.New(), APIInternalURL: srv.URL, WorkerAPIKey: "worker-key"}
	task, _ := NewStorageViolationsTask()

	err := h.Handle(context.Background(), task)
	require.NoError(t, err)
}
