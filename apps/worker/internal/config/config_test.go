package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setRequiredEnv(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "postgres://u:p@localhost:5432/db")
	t.Setenv("REDIS_URL", "redis://localhost:6379/0")
	t.Setenv("WORKER_API_KEY", "test-key")
	t.Setenv("TELEGRAM_BOT_TOKEN", "test-token")
}

func TestLoad_HappyPathReadsAllVars(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("API_INTERNAL_URL", "http://api:3002")
	t.Setenv("AI_SERVICE_URL", "http://artificial-intelligence:3004")
	t.Setenv("AI_SERVICE_API_KEY", "ai-key")
	t.Setenv("PORT", "9000")
	t.Setenv("ANOMALY_SCAN_HOURS", "6")

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, "postgres://u:p@localhost:5432/db", cfg.DatabaseURL)
	assert.Equal(t, "redis://localhost:6379/0", cfg.RedisURL)
	assert.Equal(t, "test-key", cfg.WorkerAPIKey)
	assert.Equal(t, "http://api:3002", cfg.APIInternalURL)
	assert.Equal(t, "http://artificial-intelligence:3004", cfg.AIServiceURL)
	assert.Equal(t, "ai-key", cfg.AIServiceAPIKey)
	assert.Equal(t, "test-token", cfg.TelegramBotToken)
	assert.Equal(t, "9000", cfg.Port)
	assert.Equal(t, 6, cfg.AnomalyScanHours)
}

func TestLoad_PortDefaultsTo3005WhenUnset(t *testing.T) {
	setRequiredEnv(t)

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, "3005", cfg.Port)
}

func TestLoad_AnomalyScanHoursDefaultsToZeroWhenUnset(t *testing.T) {
	setRequiredEnv(t)

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, 0, cfg.AnomalyScanHours)
}

func TestLoad_AnomalyScanHoursRejectsNonInt(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("ANOMALY_SCAN_HOURS", "not-a-number")

	_, err := Load()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "ANOMALY_SCAN_HOURS")
}

func TestLoad_MissingRequiredVarsListsEachName(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("REDIS_URL", "")
	t.Setenv("WORKER_API_KEY", "")
	t.Setenv("TELEGRAM_BOT_TOKEN", "")

	_, err := Load()
	require.Error(t, err)
	for _, name := range []string{"DATABASE_URL", "REDIS_URL", "WORKER_API_KEY", "TELEGRAM_BOT_TOKEN"} {
		assert.Contains(t, err.Error(), name)
	}
}
