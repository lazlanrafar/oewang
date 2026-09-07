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

func TestAnomalyScanAllHandler_PostsWithAPIKey(t *testing.T) {
	var gotPath, gotKey string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotKey = r.Header.Get("x-api-key")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	h := &AnomalyScanAllHandler{Client: apiclient.New(), AIServiceURL: srv.URL, AIServiceAPIKey: "ai-key"}
	task, err := NewAnomalyScanAllTask()
	require.NoError(t, err)

	err = h.Handle(context.Background(), task)
	require.NoError(t, err)
	assert.Equal(t, "/internal/anomaly/scan-all", gotPath)
	assert.Equal(t, "ai-key", gotKey)
}

func TestAnomalyScanAllHandler_NonSuccessSurfacesAsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	h := &AnomalyScanAllHandler{Client: apiclient.New(), AIServiceURL: srv.URL, AIServiceAPIKey: "ai-key"}
	task, _ := NewAnomalyScanAllTask()

	err := h.Handle(context.Background(), task)
	require.Error(t, err)
}

func TestAnomalyScanAllHandler_2xxIsSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	h := &AnomalyScanAllHandler{Client: apiclient.New(), AIServiceURL: srv.URL, AIServiceAPIKey: "ai-key"}
	task, _ := NewAnomalyScanAllTask()

	err := h.Handle(context.Background(), task)
	require.NoError(t, err)
}
