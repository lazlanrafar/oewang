package telegram

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// redirectTransport rewrites every request's scheme+host to point at a test
// server, so Client's hardcoded apiBase ("https://api.telegram.org") can be
// intercepted without changing production code.
type redirectTransport struct {
	target *url.URL
}

func (rt *redirectTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req.URL.Scheme = rt.target.Scheme
	req.URL.Host = rt.target.Host
	return http.DefaultTransport.RoundTrip(req)
}

func newTestClient(t *testing.T, handler http.HandlerFunc) (*Client, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(handler)
	target, err := url.Parse(srv.URL)
	require.NoError(t, err)
	c := New("test-token")
	c.HTTPClient = &http.Client{Transport: &redirectTransport{target: target}}
	return c, srv
}

func TestSendMessage_ReturnsMessageID(t *testing.T) {
	c, srv := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/bottest-token/sendMessage", r.URL.Path)
		var body map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		assert.Equal(t, "chat-1", body["chat_id"])
		assert.Equal(t, "hello", body["text"])
		assert.Equal(t, "Markdown", body["parse_mode"])
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"result":{"message_id":42}}`))
	})
	defer srv.Close()

	id := c.SendMessage(context.Background(), "chat-1", "hello")
	assert.Equal(t, int64(42), id)
}

func TestSendMessage_ReturnsZeroOnNotOK(t *testing.T) {
	c, srv := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":false}`))
	})
	defer srv.Close()

	id := c.SendMessage(context.Background(), "chat-1", "hello")
	assert.Equal(t, int64(0), id)
}

func TestSendMessage_ReturnsZeroOnTransportError(t *testing.T) {
	c := New("test-token")
	c.HTTPClient = &http.Client{Transport: &redirectTransport{target: &url.URL{Scheme: "http", Host: "127.0.0.1:1"}}}

	id := c.SendMessage(context.Background(), "chat-1", "hello")
	assert.Equal(t, int64(0), id)
}

func TestEditMessageText_SendsParseModeWhenGiven(t *testing.T) {
	var gotBody map[string]any
	c, srv := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/bottest-token/editMessageText", r.URL.Path)
		require.NoError(t, json.NewDecoder(r.Body).Decode(&gotBody))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	defer srv.Close()

	c.EditMessageText(context.Background(), "chat-1", 42, "updated text", "Markdown")
	assert.Equal(t, "Markdown", gotBody["parse_mode"])
	assert.Equal(t, "updated text", gotBody["text"])
}

func TestEditMessageText_OmitsParseModeWhenEmpty(t *testing.T) {
	var gotBody map[string]any
	c, srv := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, json.NewDecoder(r.Body).Decode(&gotBody))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	defer srv.Close()

	c.EditMessageText(context.Background(), "chat-1", 42, "plain text", "")
	_, hasParseMode := gotBody["parse_mode"]
	assert.False(t, hasParseMode)
}

func TestSendDocument_SendsURLAndCaption(t *testing.T) {
	var gotBody map[string]any
	c, srv := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/bottest-token/sendDocument", r.URL.Path)
		require.NoError(t, json.NewDecoder(r.Body).Decode(&gotBody))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	defer srv.Close()

	c.SendDocument(context.Background(), "chat-1", "https://r2/export.csv", "export.csv")
	assert.Equal(t, "https://r2/export.csv", gotBody["document"])
	assert.Equal(t, "export.csv", gotBody["caption"])
}

func TestSendDocument_OmitsCaptionWhenEmpty(t *testing.T) {
	var gotBody map[string]any
	c, srv := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, json.NewDecoder(r.Body).Decode(&gotBody))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	defer srv.Close()

	c.SendDocument(context.Background(), "chat-1", "https://r2/export.csv", "")
	_, hasCaption := gotBody["caption"]
	assert.False(t, hasCaption)
}

func TestDownloadFile_Success(t *testing.T) {
	c, srv := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/bottest-token/getFile":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"ok":true,"result":{"file_path":"photos/file_1.jpg"}}`))
		case r.URL.Path == "/file/bottest-token/photos/file_1.jpg":
			_, _ = w.Write([]byte("fake-image-bytes"))
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	})
	defer srv.Close()

	data, err := c.DownloadFile(context.Background(), "file-id-1")
	require.NoError(t, err)
	assert.Equal(t, "fake-image-bytes", string(data))
}

func TestDownloadFile_NotOK_ReturnsNilNil(t *testing.T) {
	c, srv := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":false}`))
	})
	defer srv.Close()

	data, err := c.DownloadFile(context.Background(), "file-id-1")
	require.NoError(t, err)
	assert.Nil(t, data)
}

func TestDownloadFile_DownloadFails_ReturnsError(t *testing.T) {
	c, srv := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/bottest-token/getFile":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"ok":true,"result":{"file_path":"photos/file_1.jpg"}}`))
		default:
			w.WriteHeader(http.StatusInternalServerError)
		}
	})
	defer srv.Close()

	_, err := c.DownloadFile(context.Background(), "file-id-1")
	require.Error(t, err)
}

func TestStartTyping_FiresImmediatelyAndStopIsIdempotent(t *testing.T) {
	callCount := 0
	c, srv := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	defer srv.Close()

	stop := c.StartTyping(context.Background(), "chat-1")
	// Give the immediate fire a moment to land.
	time.Sleep(50 * time.Millisecond)
	assert.GreaterOrEqual(t, callCount, 1)

	// Must not panic or block when called twice.
	stop()
	stop()
}

func TestNew_DefaultsTimeout(t *testing.T) {
	c := New("tok")
	assert.Equal(t, 15*time.Second, c.HTTPClient.Timeout)
}
