import { createLogger } from "@workspace/logger";

const log = createLogger("cache");

let redis: typeof import("@workspace/redis").redis | null = null;
// ioredis instances expose a 'status' string; @upstash/redis REST client does not.
let isIoredis = false;

import("@workspace/redis")
  .then((m) => {
    redis = m.redis;
    isIoredis = typeof (redis as any)?.status === "string";
  })
  .catch(() => {});

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const val = await redis.get(key);
    if (!val) return null;
    return JSON.parse(val as string) as T;
  } catch (err) {
    log.warn("Cache get failed", { key, err });
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  if (!redis) return;
  try {
    const serialized = JSON.stringify(value);
    if (isIoredis) {
      // ioredis: SET key value EX seconds
      await (redis as any).set(key, serialized, "EX", ttlSeconds);
    } else {
      // @upstash/redis: SET key value { ex: seconds }
      await redis.set(key, serialized, { ex: ttlSeconds });
    }
  } catch (err) {
    log.warn("Cache set failed", { key, err });
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (err) {
    log.warn("Cache del failed", { keys, err });
  }
}
