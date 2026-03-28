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
    return new Redis(REDIS_URL);
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
