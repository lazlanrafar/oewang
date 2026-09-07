package tasks

import (
	"context"

	goredis "github.com/redis/go-redis/v9"
)

// RedisCache adapts *goredis.Client to the CacheInvalidator interface —
// go-redis's Del returns *redis.IntCmd, not a plain error, so this narrows
// it to the one method TelegramWebhookHandler needs.
type RedisCache struct {
	Client *goredis.Client
}

func (c *RedisCache) Del(ctx context.Context, key string) error {
	return c.Client.Del(ctx, key).Err()
}
