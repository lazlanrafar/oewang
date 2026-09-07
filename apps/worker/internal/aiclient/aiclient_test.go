package aiclient

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestServer(t *testing.T, path string, wantAPIKey string, respond func(w http.ResponseWriter, body []byte)) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, path, r.URL.Path)
		assert.Equal(t, wantAPIKey, r.Header.Get("x-api-key"))
		var body []byte
		if r.Body != nil {
			buf := make([]byte, r.ContentLength)
			_, _ = r.Body.Read(buf)
			body = buf
		}
		respond(w, body)
	}))
}

func TestGetLatestDraftState_ReturnsNilWhenNoDraft(t *testing.T) {
	srv := newTestServer(t, "/draft/latest-state", "key", func(w http.ResponseWriter, body []byte) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"draft": null}`))
	})
	defer srv.Close()

	c := New(srv.URL, "key")
	draft, err := c.GetLatestDraftState(context.Background(), []DraftMessage{{Role: "user", Content: "hi"}})
	require.NoError(t, err)
	assert.Nil(t, draft)
}

func TestGetLatestDraftState_ReturnsDraft(t *testing.T) {
	srv := newTestServer(t, "/draft/latest-state", "key", func(w http.ResponseWriter, body []byte) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"draft": {"status": "awaiting_confirmation"}}`))
	})
	defer srv.Close()

	c := New(srv.URL, "key")
	draft, err := c.GetLatestDraftState(context.Background(), nil)
	require.NoError(t, err)
	require.NotNil(t, draft)
	assert.Equal(t, "awaiting_confirmation", draft["status"])
}

func TestHandlePendingInvoiceDraft_ReturnsResult(t *testing.T) {
	srv := newTestServer(t, "/draft/handle-pending", "key", func(w http.ResponseWriter, body []byte) {
		var req map[string]any
		require.NoError(t, json.Unmarshal(body, &req))
		assert.Equal(t, "ws-1", req["workspace_id"])
		assert.Equal(t, "user-1", req["user_id"])
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"result": {"sessionId": "sess-1", "reply": "Confirmed!"}}`))
	})
	defer srv.Close()

	c := New(srv.URL, "key")
	result, err := c.HandlePendingInvoiceDraft(context.Background(), "ws-1", "user-1", DraftMessage{Role: "user", Content: "yes"}, map[string]any{"status": "awaiting_confirmation"}, "sess-1")
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, "Confirmed!", result.Reply)
	assert.Equal(t, "sess-1", result.SessionID)
}

func TestBuildInvoiceDraftFromAttachments_ReturnsNilOnNoExtraction(t *testing.T) {
	srv := newTestServer(t, "/draft/build-from-attachments", "key", func(w http.ResponseWriter, body []byte) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"result": null}`))
	})
	defer srv.Close()

	c := New(srv.URL, "key")
	result, err := c.BuildInvoiceDraftFromAttachments(context.Background(), "ws-1", "user-1", []Attachment{{Name: "receipt.jpg", Type: "image/jpeg", Data: "base64"}})
	require.NoError(t, err)
	assert.Nil(t, result)
}

func TestExecuteTool_ReturnsResult(t *testing.T) {
	srv := newTestServer(t, "/tools/execute", "key", func(w http.ResponseWriter, body []byte) {
		var req map[string]any
		require.NoError(t, json.Unmarshal(body, &req))
		assert.Equal(t, "create_transaction", req["tool"])
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"result": {"success": true, "dryRun": false}}`))
	})
	defer srv.Close()

	c := New(srv.URL, "key")
	result, err := c.ExecuteTool(context.Background(), "create_transaction", map[string]any{"amount": 5000.0}, "ws-1", "user-1")
	require.NoError(t, err)
	assert.Equal(t, true, result["success"])
	assert.Equal(t, false, result["dryRun"])
}

func TestExtractTransactions_ReturnsRows(t *testing.T) {
	srv := newTestServer(t, "/import/extract", "key", func(w http.ResponseWriter, body []byte) {
		var req map[string]any
		require.NoError(t, json.Unmarshal(body, &req))
		assert.Equal(t, "ws-1", req["workspace_id"])
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"transactions": [{"name":"Coffee","amount":50000,"date":"2026-01-01","type":"expense","walletName":"Cash","categoryName":"Food","description":null}]}`))
	})
	defer srv.Close()

	c := New(srv.URL, "key")
	rows, err := c.ExtractTransactions(context.Background(), "base64data", "text/csv", []string{"Cash"}, []string{"Food"}, "ws-1")
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, "Coffee", rows[0].Name)
	assert.Equal(t, 50000.0, rows[0].Amount)
	require.NotNil(t, rows[0].WalletName)
	assert.Equal(t, "Cash", *rows[0].WalletName)
}

func TestPost_NonOKStatus_ReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := New(srv.URL, "key")
	_, err := c.GetLatestDraftState(context.Background(), nil)
	require.Error(t, err)
}
