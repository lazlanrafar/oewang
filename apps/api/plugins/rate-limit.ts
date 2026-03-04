import { Elysia } from "elysia";
import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { encrypt } from "@workspace/encryption";
import { Env } from "@workspace/constants";

/**
 * Rate limiter state. In-memory for dev, Redis-backed in production.
 */
const rate_limit_store = new Map<string, { count: number; reset_at: number }>();

type RateLimitConfig = {
  max_requests: number;
  window_ms: number;
};

const AUTHENTICATED_LIMIT: RateLimitConfig = {
  max_requests: 300,
  window_ms: 60_000, // 1 minute
};

const UNAUTHENTICATED_LIMIT: RateLimitConfig = {
  max_requests: 30,
  window_ms: 60_000,
};

const AUTH_ENDPOINT_LIMIT: RateLimitConfig = {
  max_requests: 10,
  window_ms: 900_000, // 15 minutes
};

function getClientKey(
  request: Request,
  auth: { workspace_id?: string } | null,
): string {
  if (auth?.workspace_id) {
    return `ws:${auth.workspace_id}`;
  }

  // Fall back to IP
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  return `ip:${ip}`;
}

function isAuthEndpoint(path: string): boolean {
  return path.includes("/auth/");
}

function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): { allowed: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const entry = rate_limit_store.get(key);

  if (!entry || now > entry.reset_at) {
    const reset_at = now + config.window_ms;
    rate_limit_store.set(key, { count: 1, reset_at });
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

/**
 * Rate limiting plugin — applied globally.
 * - Authenticated: 300 req/min per workspace
 * - Unauthenticated: 30 req/min per IP
 * - Auth endpoints: 10 req/15min per IP
 */
export const rateLimitPlugin = new Elysia({
  name: "rate-limit",
}).onBeforeHandle(({ request, set, headers }) => {
  // biome-ignore lint/suspicious/noExplicitAny: Elysia internal types
  const auth = (headers as any)?.auth ?? null;
  const path = new URL(request.url).pathname;

  let config: RateLimitConfig;

  if (isAuthEndpoint(path)) {
    config = AUTH_ENDPOINT_LIMIT;
  } else if (auth?.workspace_id) {
    config = AUTHENTICATED_LIMIT;
  } else {
    config = UNAUTHENTICATED_LIMIT;
  }

  const key = getClientKey(request, auth);
  const result = checkRateLimit(key, config);

  // Always set rate limit headers
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
