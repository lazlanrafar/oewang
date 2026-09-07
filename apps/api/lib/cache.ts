import { createLogger } from "@workspace/logger";

const log = createLogger("cache");

let redis: typeof import("@workspace/redis").redis | null = null;

import("@workspace/redis")
  .then((m) => {
    redis = m.redis;
  })
  .catch(() => {});

export async function cacheGet<T>(key: string | null): Promise<T | null> {
  if (!redis || !key) return null;
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
  key: string | null,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  if (!redis || !key) return;
  try {
    const serialized = JSON.stringify(value);
    await redis.set(key, serialized, "EX", ttlSeconds);
  } catch (err) {
    log.warn("Cache set failed", { key, err });
  }
}

export async function cacheDel(
  ...keys: (string | null | undefined)[]
): Promise<void> {
  const real = keys.filter((k): k is string => !!k);
  if (!redis || real.length === 0) return;
  try {
    await redis.del(...real);
  } catch (err) {
    log.warn("Cache del failed", { keys: real, err });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Acquire a short SET NX lock. Returns true if this caller won the lock.
async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
  if (!redis) return false;
  try {
    const res = await redis.set(key, "1", "EX", ttlSeconds, "NX");
    return res === "OK";
  } catch {
    return false;
  }
}

/**
 * Single-flight cache: return the cached value, or recompute exactly once under
 * a short Redis lock so a TTL expiry doesn't let concurrent requests all run the
 * expensive recompute (cache stampede). Losers of the lock wait briefly and
 * re-read; if still cold they compute rather than block. Falls back to a plain
 * recompute when Redis is absent or the key is null (uncacheable).
 */
export async function getOrSet<T>(
  key: string | null,
  ttlSeconds: number,
  recompute: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  if (!redis || !key) return recompute();

  const lockKey = `lock:${key}`;
  if (await acquireLock(lockKey, 5)) {
    try {
      const value = await recompute();
      await cacheSet(key, value, ttlSeconds);
      return value;
    } finally {
      await cacheDel(lockKey);
    }
  }

  // Another caller holds the lock — wait a moment and re-read before falling
  // back to computing ourselves (never block indefinitely).
  for (let i = 0; i < 5; i++) {
    await sleep(100);
    const retry = await cacheGet<T>(key);
    if (retry !== null) return retry;
  }
  return recompute();
}
