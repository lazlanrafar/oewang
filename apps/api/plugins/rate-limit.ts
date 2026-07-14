import { Env } from "@workspace/constants";
import { encrypt } from "@workspace/encryption";
import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { Elysia } from "elysia";

// Use whatever Redis the environment provides (ioredis via REDIS_URL, or
// Upstash REST) — same init as lib/cache.ts. Without this, prod (REDIS_URL
// only) silently rate-limits per-instance in memory.
let redis: typeof import("@workspace/redis").redis | null = null;
import("@workspace/redis")
  .then((mod) => {
    redis = mod.redis;
  })
  .catch(() => {});

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

function isPublicWebhookEndpoint(path: string): boolean {
  return (
    path.includes("/integrations/telegram/webhook") ||
    path.includes("/integrations/whatsapp/webhook") ||
    path.includes("/mayar/webhook")
  );
}

async function checkRateLimitRedis(
  key: string,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  // Fixed window via INCR on a window-indexed key: one code path that works on
  // both ioredis and the Upstash REST client (their zadd/pipeline syntaxes
  // differ). ponytail: fixed window, switch to a sliding window only if
  // boundary bursts ever matter.
  const now = Date.now();
  const window_index = Math.floor(now / config.window_ms);
  const windowKey = `ratelimit:${key}:${window_index}`;
  const reset = Math.ceil(((window_index + 1) * config.window_ms) / 1000);

  try {
    const count = (await redis!.incr(windowKey)) as number;
    if (count === 1) {
      await redis!.expire(windowKey, Math.ceil(config.window_ms / 1000));
    }

    return {
      allowed: count <= config.max_requests,
      remaining: Math.max(0, config.max_requests - count),
      reset,
    };
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

/**
 * Apply the strict auth-endpoint limit (10 / 15min) to a caller keyed by the
 * given string. For routes mounted OUTSIDE the plugin chain (e.g. the MCP
 * OAuth login, which is registered before rateLimitPlugin), which the global
 * onBeforeHandle hook never sees.
 */
export function rateLimitAuthEndpoint(
  key: string,
): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  return checkRateLimit(`auth:${key}`, AUTH_ENDPOINT_LIMIT);
}

export const rateLimitPlugin = new Elysia({
  name: "rate-limit",
})
  .onBeforeHandle(async (ctx: any) => {
    const { request, set, auth } = ctx;
    const account = auth as { workspace_id?: string; user_id?: string } | null;
    const path = new URL(request.url).pathname;

    // Public provider webhooks (Telegram, WhatsApp/Evolution, Mayar) hit this
    // server at high frequency from a small set of provider IPs. Rate-limiting
    // them would silently drop legitimate bot traffic, so skip the limit here —
    // signature/secret verification still gates these endpoints downstream.
    if (isPublicWebhookEndpoint(path)) {
      return;
    }

    // Internal sidecar surface (Python AI service) is unauthenticated (no JWT) so
    // it would share the tight IP bucket; a single multi-tool chat fans out into
    // many internal calls. The shared AI_SERVICE_API_KEY gates it instead.
    if (path.includes("/ai/internal")) {
      return;
    }

    // Each tier gets its own counter key: a burst of unauthenticated traffic
    // (e.g. 401s on the login page) must not consume the strict 10/15min auth
    // bucket and block the login itself.
    let config: RateLimitConfig;
    let bucket: string;

    if (isAuthEndpoint(path)) {
      config = AUTH_ENDPOINT_LIMIT;
      bucket = "auth";
    } else if (account?.workspace_id) {
      config = AUTHENTICATED_LIMIT;
      bucket = "authed";
    } else {
      config = UNAUTHENTICATED_LIMIT;
      bucket = "unauth";
    }

    const key = `${bucket}:${getClientKey(request, account)}`;
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
    // Without .as("scoped") this hook stays local to the plugin instance and
    // never runs for routes on the parent app — i.e. no rate limiting at all.
  })
  .as("scoped");
