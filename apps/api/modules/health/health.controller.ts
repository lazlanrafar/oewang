import { Elysia } from "elysia";
import { HealthService } from "./health.service";

export interface HealthStatus {
  status: "ok" | "degraded" | "unhealthy";
  checks: {
    database: { status: "ok" | "error"; latency_ms?: number; error?: string };
    redis: { status: "ok" | "error"; latency_ms?: number; error?: string };
  };
  timestamp: string;
  uptime: number;
}

export const healthController = new Elysia({ prefix: "/health" })
  .get(
    "/",
    async (): Promise<Response> => {
      const { status, checks } = await HealthService.checkStatus();
      return new Response(
        JSON.stringify({
          status,
          checks,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    },
    {
      detail: {
        summary: "Health Check",
        description:
          "Returns the current health status of the API including database and Redis connectivity",
        tags: ["System"],
      },
    },
  )
  .get(
    "/live",
    () =>
      new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      }),
    {
      detail: {
        summary: "Liveness Probe",
        description:
          "Simple liveness check - returns 200 if the server is running",
        tags: ["System"],
      },
    },
  )
  .get(
    "/ready",
    async () => {
      const isReady = await HealthService.ready();
      if (isReady) {
        return new Response(JSON.stringify({ status: "ready" }), {
          headers: { "Content-Type": "application/json" },
        });
      } else {
        return new Response(JSON.stringify({ status: "not_ready" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
    {
      detail: {
        summary: "Readiness Probe",
        description:
          "Returns 200 if the server is ready to accept traffic (database connected)",
        tags: ["System"],
      },
    },
  );
