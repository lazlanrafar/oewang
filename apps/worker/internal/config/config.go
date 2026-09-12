// Package config loads apps/worker's configuration from process env vars.
//
// This monorepo's convention is a single root .env, symlinked into every
// app dir (apps/worker/.env -> ../../.env) the same way apps/api and
// apps/app are. Unlike Bun/Next (which auto-load a cwd .env) or apps/ai's
// pydantic-settings (which reads env_file directly), Go has no built-in
// .env support, so Load bridges that gap with godotenv. In production
// (Coolify) no .env file exists in the container — godotenv.Load's error
// is ignored and real injected env vars are read as before; godotenv never
// overrides a var that's already set in the environment either way.
package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config holds every env var apps/worker needs. Required fields fail fast
// at startup (see Load) rather than surfacing as a confusing runtime error
// later (e.g. a nil DB pool).
type Config struct {
	// DatabaseURL is the Postgres connection string, reused as-is from the
	// root .env (same DATABASE_URL packages/database uses).
	DatabaseURL string
	// RedisURL is a real TCP Redis connection string (asynq needs BRPOP/EVAL,
	// which Upstash REST mode can't serve — confirmed prod runs real Redis).
	RedisURL string
	// WorkerAPIKey is the shared secret used in both directions: apps/api
	// uses it to call this worker's /internal/enqueue/:kind endpoint, and
	// this worker uses it to call apps/api's internal endpoints.
	WorkerAPIKey string
	// APIInternalURL is the base URL for apps/api's internal endpoints.
	APIInternalURL string
	// AIServiceURL is the base URL for apps/ai's internal endpoints.
	AIServiceURL string
	// AIServiceAPIKey is the key apps/ai's require_api_key already trusts —
	// reused as-is, not a second Python-side key.
	AIServiceAPIKey string
	// TelegramBotToken is the same bot token apps/api already uses (Env.TELEGRAM_BOT_TOKEN) —
	// the worker now owns the full Telegram webhook state machine, so it calls
	// the Telegram Bot API directly instead of relaying through apps/api.
	TelegramBotToken string
	// AnomalyScanHours mirrors apps/ai/app/config.py's own
	// ANOMALY_SCAN_HOURS: int = 0  # 0 = periodic scan disabled (opt-in).
	// The anomaly periodic task is only registered when this is > 0.
	AnomalyScanHours int
	// Port is the health+enqueue HTTP server's bind port.
	Port string
}

// Load reads Config from the environment, failing fast (returning an error)
// if any required var is missing. Callers should log.Fatal / os.Exit(1) on
// error rather than proceeding with a half-configured worker.
func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		RedisURL:         os.Getenv("REDIS_URL"),
		WorkerAPIKey:     os.Getenv("WORKER_API_KEY"),
		APIInternalURL:   os.Getenv("API_INTERNAL_URL"),
		AIServiceURL:     os.Getenv("AI_SERVICE_URL"),
		AIServiceAPIKey:  os.Getenv("AI_SERVICE_API_KEY"),
		TelegramBotToken: os.Getenv("TELEGRAM_BOT_TOKEN"),
		Port:             os.Getenv("PORT"),
	}

	var missing []string
	if cfg.DatabaseURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	if cfg.RedisURL == "" {
		missing = append(missing, "REDIS_URL")
	}
	if cfg.WorkerAPIKey == "" {
		missing = append(missing, "WORKER_API_KEY")
	}
	if cfg.TelegramBotToken == "" {
		missing = append(missing, "TELEGRAM_BOT_TOKEN")
	}
	if cfg.AIServiceURL == "" {
		missing = append(missing, "AI_SERVICE_URL")
	}
	if cfg.AIServiceAPIKey == "" {
		missing = append(missing, "AI_SERVICE_API_KEY")
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("config: missing required env vars: %v", missing)
	}

	if cfg.Port == "" {
		cfg.Port = "3005"
	}

	hoursStr := os.Getenv("ANOMALY_SCAN_HOURS")
	if hoursStr == "" {
		cfg.AnomalyScanHours = 0
	} else {
		hours, err := strconv.Atoi(hoursStr)
		if err != nil {
			return nil, fmt.Errorf("config: ANOMALY_SCAN_HOURS must be an int, got %q: %w", hoursStr, err)
		}
		cfg.AnomalyScanHours = hours
	}

	return cfg, nil
}
