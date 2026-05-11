import { Env } from "@workspace/constants";
import { encrypt } from "@workspace/encryption";
import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { Elysia } from "elysia";

let redis: typeof import("@workspace/redis").redis | null = null;
if (Env.UPSTASH_REDIS_REST_URL && Env.UPSTASH_REDIS_REST_TOKEN) {
  import("@workspace/redis").then((mod) => {
    redis = mod.redis;
  });
}

type RateLimitConfig = {
  max_requests: number;
  window_ms: number;
};

const AUTHENTICATED_LIMIT: RateLimitConfig = {
  max_requests: 300,
  window_ms: 60_000,
};

const UNAUTHENTICATED_LIMIT: RateLimitConfig = {
  max_requests: 30,
  window_ms: 60_000,
};

const AUTH_ENDPOINT_LIMIT: RateLimitConfig = {
  max_requests: 10,
  window_ms: 900_000,
};

function getClientKey(
  request: Request,
  auth: { workspace_id?: string } | null,
): string {
  if (auth?.workspace_id) {
    return `ws:${auth.workspace_id}`;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  return `ip:${ip}`;
}

function isAuthEndpoint(path: string): boolean {
  return path.includes("/auth/");
}

async function checkRateLimitRedis(
  key: string,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  const now = Date.now();
  const windowKey = `ratelimit:${key}`;
  const windowStart = now - config.window_ms;

  try {
    const pipeline = redis!.pipeline();
    pipeline.zremrangebyscore(windowKey, 0, windowStart);
    pipeline.zcard(windowKey);
    pipeline.zadd(windowKey, { score: now, member: `${now}:${Math.random()}` });
    pipeline.expire(windowKey, Math.ceil(config.window_ms / 1000));
    const results = (await pipeline.exec()) as [any, number][] | null;

    const currentCount = results?.[1]?.[1] ?? 0;
    const allowed = currentCount < config.max_requests;
    const remaining = Math.max(0, config.max_requests - currentCount - 1);
    const reset = Math.ceil((now + config.window_ms) / 1000);

    return { allowed, remaining, reset };
  } catch {
    return checkRateLimitMemory(key, config);
  }
}

const memoryStore = new Map<string, { count: number; reset_at: number }>();

function checkRateLimitMemory(
  key: string,
  config: RateLimitConfig,
): { allowed: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || now > entry.reset_at) {
    const reset_at = now + config.window_ms;
    memoryStore.set(key, { count: 1, reset_at });
    return {
      allowed: true,
      remaining: config.max_requests - 1,
      reset: Math.ceil(reset_at / 1000),
    };
  }

  entry.count++;
  const remaining = Math.max(0, config.max_requests - entry.count);

  return {
    allowed: entry.count <= config.max_requests,
    remaining,
    reset: Math.ceil(entry.reset_at / 1000),
  };
}

async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  if (redis) {
    return checkRateLimitRedis(key, config);
  }
  return checkRateLimitMemory(key, config);
}

export const rateLimitPlugin = new Elysia({
  name: "rate-limit",
}).onBeforeHandle(async (ctx: any) => {
  const { request, set, auth } = ctx;
  const account = auth as { workspace_id?: string; user_id?: string } | null;
  const path = new URL(request.url).pathname;

  let config: RateLimitConfig;

  if (isAuthEndpoint(path)) {
    config = AUTH_ENDPOINT_LIMIT;
  } else if (account?.workspace_id) {
    config = AUTHENTICATED_LIMIT;
  } else {
    config = UNAUTHENTICATED_LIMIT;
  }

  const key = getClientKey(request, account);
  const result = await checkRateLimit(key, config);

  set.headers["X-RateLimit-Limit"] = String(config.max_requests);
  set.headers["X-RateLimit-Remaining"] = String(result.remaining);
  set.headers["X-RateLimit-Reset"] = String(result.reset);

  if (!result.allowed) {
    set.status = 429;
    const error_response = buildError(
      ErrorCode.RATE_LIMIT_EXCEEDED,
      "Too many requests. Please try again later.",
    );

    const secret = Env.ENCRYPTION_KEY;
    if (secret) {
      try {
        const encrypted = encrypt(JSON.stringify(error_response), secret);
        return new Response(JSON.stringify({ data: encrypted }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "x-encrypted": "true",
            "X-RateLimit-Limit": String(config.max_requests),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(result.reset),
          },
        });
      } catch {
        return error_response;
      }
    }
    return error_response;
  }
});
