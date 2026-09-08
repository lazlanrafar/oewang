package tasks

import (
	"context"
	"testing"

	"github.com/alicebob/miniredis/v2"
	goredis "github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRedisCache_Del_RemovesExistingKey(t *testing.T) {
	mr := miniredis.RunT(t)
	client := goredis.NewClient(&goredis.Options{Addr: mr.Addr()})
	defer client.Close()

	mr.Set("session:1", "value")
	cache := &RedisCache{Client: client}

	err := cache.Del(context.Background(), "session:1")
	require.NoError(t, err)
	assert.False(t, mr.Exists("session:1"))
}

func TestRedisCache_Del_PropagatesErrorWhenConnectionClosed(t *testing.T) {
	mr := miniredis.RunT(t)
	client := goredis.NewClient(&goredis.Options{Addr: mr.Addr()})
	client.Close()

	cache := &RedisCache{Client: client}
	err := cache.Del(context.Background(), "session:1")
	assert.Error(t, err)
}
