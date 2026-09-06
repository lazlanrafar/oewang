import { Redis as UpstashRedis } from "@upstash/redis";
import Redis from "ioredis";
import { loadEnv } from "@workspace/utils/load-env";
import { Env } from "@workspace/constants";

loadEnv();

const REDIS_URL = process.env.REDIS_URL;
const UPSTASH_REDIS_REST_URL = Env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = Env.UPSTASH_REDIS_REST_TOKEN;

// Factory function to create the appropriate Redis client
const createRedisClient = () => {
  // 1. If REDIS_URL is provided (Standard TCP Redis, e.g. Docker or Railway internal)
  if (REDIS_URL) {
    if (process.env.NODE_ENV !== "test") {
      console.log("🚀 Using Standard Redis (TCP)");
    }
    // ioredis's own URL parser never decodeURIComponent()s the userinfo, so a
    // percent-encoded password (e.g. one containing "/") is sent to Redis
    // verbatim and AUTH fails — parse the URL ourselves and decode it first.
    const parsed = new URL(REDIS_URL);
    const client = new Redis({
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 6379,
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0,
    });
    // ioredis is an EventEmitter — an "error" event with zero listeners is
    // thrown and crashes the process. Every caller (cache.ts, rate-limit.ts)
    // already catches rejected calls and falls back safely, so this listener
    // only needs to exist to stop connection-level errors (bad credentials,
    // network blips) from taking the whole process down.
    client.on("error", (err) => {
      if (process.env.NODE_ENV !== "test") {
        console.error("[redis] connection error:", err.message);
      }
    });
    return client;
  }

  // 2. If Upstash REST credentials are provided
  if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
    if (process.env.NODE_ENV !== "test") {
      console.log("🚀 Using Upstash Redis (REST)");
    }
    return new UpstashRedis({
      url: UPSTASH_REDIS_REST_URL,
      token: UPSTASH_REDIS_REST_TOKEN,
    });
  }

  // 3. Fallback/Error
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      "Missing Redis configuration. Please provide REDIS_URL or Upstash REST credentials.",
    );
  }

  // For tests, return an empty object or mock if needed
  return null as any;
};

export const redis = createRedisClient();
