package aiclient

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChatStream_ParsesContentDoneFrames(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/chat/stream", r.URL.Path)
		assert.Equal(t, "test-key", r.Header.Get("x-api-key"))
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "event: content\ndata: {\"text\":\"Hello \"}\n\n")
		fmt.Fprint(w, "event: content\ndata: {\"text\":\"Hello world\"}\n\n")
		fmt.Fprint(w, "event: done\ndata: {\"reply\":\"Hello world\",\"session_id\":\"sess-1\"}\n\n")
	}))
	defer srv.Close()

	c := New(srv.URL, "test-key")
	events, err := c.ChatStream(context.Background(), "hi", "ws-1", "user-1", "")
	require.NoError(t, err)

	var got []StreamEvent
	for evt := range events {
		got = append(got, evt)
	}

	require.Len(t, got, 3)
	assert.Equal(t, "content", got[0].Event)
	var d0 StreamContentData
	require.NoError(t, json.Unmarshal(got[0].Data, &d0))
	assert.Equal(t, "Hello ", d0.Text)

	assert.Equal(t, "done", got[2].Event)
	var d2 StreamDoneData
	require.NoError(t, json.Unmarshal(got[2].Data, &d2))
	assert.Equal(t, "Hello world", d2.Reply)
	assert.Equal(t, "sess-1", d2.SessionID)
}

func TestChatStream_ParsesErrorFrame(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "event: error\ndata: {\"error\":\"sidecar exploded\"}\n\n")
	}))
	defer srv.Close()

	c := New(srv.URL, "test-key")
	events, err := c.ChatStream(context.Background(), "hi", "ws-1", "", "")
	require.NoError(t, err)

	var got []StreamEvent
	for evt := range events {
		got = append(got, evt)
	}
	require.Len(t, got, 1)
	assert.Equal(t, "error", got[0].Event)
	var d StreamErrorData
	require.NoError(t, json.Unmarshal(got[0].Data, &d))
	assert.Equal(t, "sidecar exploded", d.Error)
}

func TestChatStream_NoTrailingBlankLine_StillFlushesFinalFrame(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		// No trailing blank line after the last frame.
		fmt.Fprint(w, "event: done\ndata: {\"reply\":\"ok\"}")
	}))
	defer srv.Close()

	c := New(srv.URL, "test-key")
	events, err := c.ChatStream(context.Background(), "hi", "ws-1", "", "")
	require.NoError(t, err)

	var got []StreamEvent
	for evt := range events {
		got = append(got, evt)
	}
	require.Len(t, got, 1)
	assert.Equal(t, "done", got[0].Event)
}

func TestChatStream_DefaultsEventNameToMessage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "data: {\"text\":\"no event line\"}\n\n")
	}))
	defer srv.Close()

	c := New(srv.URL, "test-key")
	events, err := c.ChatStream(context.Background(), "hi", "ws-1", "", "")
	require.NoError(t, err)

	var got []StreamEvent
	for evt := range events {
		got = append(got, evt)
	}
	require.Len(t, got, 1)
	assert.Equal(t, "message", got[0].Event)
}

func TestChatStream_NonOKStatus_ReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := New(srv.URL, "test-key")
	_, err := c.ChatStream(context.Background(), "hi", "ws-1", "", "")
	require.Error(t, err)
}

func TestChatStream_ContextCancel_StopsStream(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		flusher, ok := w.(http.Flusher)
		fmt.Fprint(w, "event: content\ndata: {\"text\":\"one\"}\n\n")
		if ok {
			flusher.Flush()
		}
		time.Sleep(200 * time.Millisecond)
		fmt.Fprint(w, "event: content\ndata: {\"text\":\"two\"}\n\n")
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	c := New(srv.URL, "test-key")
	events, err := c.ChatStream(ctx, "hi", "ws-1", "", "")
	require.NoError(t, err)

	first := <-events
	assert.Equal(t, "content", first.Event)
	cancel()

	// Channel must eventually close after cancellation, not hang forever.
	select {
	case _, ok := <-events:
		if ok {
			// drain until closed
			for range events {
			}
		}
	case <-time.After(2 * time.Second):
		t.Fatal("events channel did not close after context cancellation")
	}
}
