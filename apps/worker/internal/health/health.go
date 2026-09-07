// Package health exposes GET /health, checked against both dependencies
// this worker cannot function without: Postgres and Redis.
package health

import (
	"context"
	"encoding/json"
	"net/http"
)

// DBPinger is satisfied by *pgxpool.Pool. Kept as a narrow interface so
// tests can inject a fake that fails on demand.
type DBPinger interface {
	Ping(ctx context.Context) error
}

// RedisPinger is satisfied by *redis.Client (go-redis, the same client
// library asynq itself depends on). Kept narrow for the same reason.
type RedisPinger interface {
	Ping(ctx context.Context) error
}

// PingFunc adapts a plain function into DBPinger/RedisPinger. Useful for
// wrapping a real client whose native Ping doesn't return a plain error —
// e.g. go-redis's *redis.Client.Ping returns *redis.StatusCmd, so callers
// wire it up as health.PingFunc(func(ctx) error { return rdb.Ping(ctx).Err() }).
type PingFunc func(ctx context.Context) error

func (f PingFunc) Ping(ctx context.Context) error { return f(ctx) }

// Handler returns an http.HandlerFunc for GET /health. It pings both db and
// rdb; if both succeed it responds 200 {"status":"ok"}, otherwise 503 with
// which dependency failed.
func Handler(db DBPinger, rdb RedisPinger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		if err := db.Ping(ctx); err != nil {
			writeUnhealthy(w, "database", err)
			return
		}
		if err := rdb.Ping(ctx); err != nil {
			writeUnhealthy(w, "redis", err)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

func writeUnhealthy(w http.ResponseWriter, which string, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusServiceUnavailable)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status": "unhealthy",
		"failed": which,
		"error":  err.Error(),
	})
}
