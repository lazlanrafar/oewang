package db

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewPool_InvalidDSNReturnsParseError(t *testing.T) {
	_, err := NewPool(context.Background(), "not a valid postgres dsn")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "parse DATABASE_URL")
}

func TestNewPool_ValidDSNCreatesPoolWithConfiguredMaxConns(t *testing.T) {
	// pgxpool connects lazily — NewWithConfig doesn't dial, so a syntactically
	// valid but unreachable DSN is enough to exercise the happy path without
	// a live Postgres instance.
	pool, err := NewPool(context.Background(), "postgres://u:p@127.0.0.1:1/db")
	require.NoError(t, err)
	defer pool.Close()

	assert.EqualValues(t, 5, pool.Config().MaxConns)
}
