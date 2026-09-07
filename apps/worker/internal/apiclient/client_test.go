package apiclient

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPost_SetsAPIKeyHeader(t *testing.T) {
	var gotKey string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey = r.Header.Get("x-api-key")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New()
	err := c.Post(context.Background(), srv.URL, "/path", "secret-key", map[string]string{"a": "b"})
	require.NoError(t, err)
	assert.Equal(t, "secret-key", gotKey)
}

func TestPost_2xxReturnsNil(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	c := New()
	err := c.Post(context.Background(), srv.URL, "/path", "key", nil)
	require.NoError(t, err)
}

func TestPost_RetriesOnce_On5xx(t *testing.T) {
	var callCount int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := New()
	err := c.Post(context.Background(), srv.URL, "/path", "key", nil)
	require.Error(t, err)
	assert.Equal(t, 2, callCount, "expected exactly one retry (two total attempts) on 5xx")
}

func TestPost_NoRetryOn4xx(t *testing.T) {
	var callCount int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer srv.Close()

	c := New()
	err := c.Post(context.Background(), srv.URL, "/path", "key", nil)
	require.Error(t, err)
	assert.Equal(t, 1, callCount, "expected no retry on 4xx")
}

func TestPost_TimeoutEnforced(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := &Client{HTTPClient: &http.Client{Timeout: 10 * time.Millisecond}}
	err := c.Post(context.Background(), srv.URL, "/path", "key", nil)
	require.Error(t, err, "expected timeout to surface as an error")
}
