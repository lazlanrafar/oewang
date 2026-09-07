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

func TestQuotaResetAllHandler_PostsWithAPIKey(t *testing.T) {
	var gotPath, gotKey string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotKey = r.Header.Get("x-api-key")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	h := &QuotaResetAllHandler{Client: apiclient.New(), AIServiceURL: srv.URL, AIServiceAPIKey: "ai-key"}
	task, err := NewQuotaResetAllTask()
	require.NoError(t, err)

	err = h.Handle(context.Background(), task)
	require.NoError(t, err)
	assert.Equal(t, "/internal/quota/reset-all", gotPath)
	assert.Equal(t, "ai-key", gotKey)
}

func TestQuotaResetAllHandler_NonSuccessSurfacesAsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	h := &QuotaResetAllHandler{Client: apiclient.New(), AIServiceURL: srv.URL, AIServiceAPIKey: "ai-key"}
	task, _ := NewQuotaResetAllTask()

	err := h.Handle(context.Background(), task)
	require.Error(t, err)
}

func TestQuotaResetAllHandler_2xxIsSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	h := &QuotaResetAllHandler{Client: apiclient.New(), AIServiceURL: srv.URL, AIServiceAPIKey: "ai-key"}
	task, _ := NewQuotaResetAllTask()

	err := h.Handle(context.Background(), task)
	require.NoError(t, err)
}
