import { Env } from "@workspace/constants";
import { redis } from "@workspace/redis";
import { HealthRepository } from "./health.repository";
import type { HealthStatus } from "./health.controller";

export abstract class HealthService {
  static async checkStatus(): Promise<{
    status: HealthStatus["status"];
    checks: HealthStatus["checks"];
  }> {
    const checks: HealthStatus["checks"] = {
      database: { status: "ok" },
      redis: { status: "ok" },
    };

    let overallStatus: HealthStatus["status"] = "ok";

    const dbStart = Date.now();
    try {
      await HealthRepository.ping();
      checks.database.latency_ms = Date.now() - dbStart;
    } catch (error) {
      checks.database.status = "error";
      checks.database.error =
        error instanceof Error ? error.message : "Unknown error";
      overallStatus = "degraded";
    }

    if (Env.UPSTASH_REDIS_REST_URL && Env.UPSTASH_REDIS_REST_TOKEN) {
      const redisStart = Date.now();
      try {
        await redis.ping();
        checks.redis.latency_ms = Date.now() - redisStart;
      } catch (error) {
        checks.redis.status = "error";
        checks.redis.error =
          error instanceof Error ? error.message : "Unknown error";
        overallStatus = "degraded";
      }
    } else {
      checks.redis = { status: "ok", latency_ms: 0 };
    }

    if (checks.database.status === "error") {
      overallStatus = "unhealthy";
    }

    return {
      status: overallStatus,
      checks,
    };
  }

  static async ready(): Promise<boolean> {
    try {
      await HealthRepository.ping();
      return true;
    } catch {
      return false;
    }
  }
}
