package health

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakePinger struct {
	err error
}

func (f fakePinger) Ping(ctx context.Context) error { return f.err }

func TestHandler_200WhenBothSucceed(t *testing.T) {
	h := Handler(fakePinger{}, fakePinger{})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	h(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"status":"ok"}`, rec.Body.String())
}

func TestHandler_503WhenDBFails(t *testing.T) {
	h := Handler(fakePinger{err: errors.New("db down")}, fakePinger{})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	h(rec, req)

	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	assert.Contains(t, rec.Body.String(), "database")
}

func TestHandler_503WhenRedisFails(t *testing.T) {
	h := Handler(fakePinger{}, fakePinger{err: errors.New("redis down")})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	h(rec, req)

	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	assert.Contains(t, rec.Body.String(), "redis")
}

func TestPingFunc_AdaptsPlainFunction(t *testing.T) {
	var pinger DBPinger = PingFunc(func(ctx context.Context) error { return nil })
	assert.NoError(t, pinger.Ping(context.Background()))
}
