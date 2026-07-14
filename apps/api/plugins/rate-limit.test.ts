// Pin the same keys at-rest-crypto.test.ts pins BEFORE the plugin loads:
// rate-limit.ts reads Env at module top-level, which snapshots process.env
// for the whole run (getEnv caches). A static import would hoist above these
// assignments, so the plugin must be imported dynamically.
process.env.ENCRYPTION_KEY = "a".repeat(32);
process.env.DATA_ENCRYPTION_KEY = "b".repeat(32);
// Force the in-memory limiter: with a Redis backend the counters would leak
// between test runs (15-min auth window). Empty string wins over .env because
// dotenv never overrides keys already present in process.env.
process.env.REDIS_URL = "";
process.env.UPSTASH_REDIS_REST_URL = "";
process.env.UPSTASH_REDIS_REST_TOKEN = "";

import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

// require, not import: static imports hoist above the env pins, and top-level
// await is unavailable in this CJS-typechecked package.
// biome-ignore lint/style/noCommonJs: intentional load-order control
const { rateLimitPlugin } = require("./rate-limit");

function makeApp() {
  return new Elysia()
    .use(rateLimitPlugin)
    .get("/auth/login", () => "ok")
    .get("/other", () => "ok");
}

function req(path: string, ip: string) {
  return new Request(`http://localhost${path}`, {
    headers: { "x-forwarded-for": ip },
  });
}

describe("rateLimitPlugin", () => {
  it("should propagate to parent routes when applied (scoped hook)", async () => {
    const res = await makeApp().handle(req("/other", "1.1.1.1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("30");
  });

  it("should not consume the strict auth bucket when unauthenticated traffic bursts", async () => {
    const app = makeApp();
    // 15 unauthenticated requests — above the 10/15min auth limit.
    for (let i = 0; i < 15; i++) {
      await app.handle(req("/other", "2.2.2.2"));
    }
    // Auth endpoint must still be allowed: separate bucket.
    const res = await app.handle(req("/auth/login", "2.2.2.2"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
  });

  it("should return 429 when the auth bucket itself is exhausted", async () => {
    const app = makeApp();
    let last = 200;
    for (let i = 0; i < 11; i++) {
      const res = await app.handle(req("/auth/login", "3.3.3.3"));
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
