import { Redis } from "@upstash/redis";
import { loadEnv } from "@workspace/utils/load-env";
import { Env } from "@workspace/constants";

loadEnv();

const UPSTASH_REDIS_REST_URL = Env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = Env.UPSTASH_REDIS_REST_TOKEN;

if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
  throw new Error(
    "Missing Upstash Redis configuration in environment variables",
  );
}

export const redis = new Redis({
  url: UPSTASH_REDIS_REST_URL,
  token: UPSTASH_REDIS_REST_TOKEN,
});
