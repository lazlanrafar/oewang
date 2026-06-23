// Sentry must be imported first to instrument everything
import "./instrument";

import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import * as Sentry from "@sentry/bun";
import { createLogger } from "@workspace/logger";
import { sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { getApiEnv } from "./config/env";

getApiEnv();

import { staticPlugin } from "@elysiajs/static";
import { Env } from "@workspace/constants";
import { db } from "@workspace/database";
import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { aiController } from "./modules/ai/ai.controller";
import { aiInternalController } from "./modules/ai/ai-internal.controller";
import { authController } from "./modules/auth/auth.controller";
import { budgets } from "./modules/budgets/budgets.controller";
import { categoriesController } from "./modules/categories/categories.controller";
import { contactsController } from "./modules/contacts/contacts.controller";
import { debtsController } from "./modules/debts/debts.controller";
import { healthController } from "./modules/health/health.controller";
import { integrationsController } from "./modules/integrations/integrations.controller";
import {
  publicWebhooksController,
  registerEvolutionWebhook,
  registerTelegramWebhook,
} from "./modules/integrations/public-webhooks.controller";
import { invoicesController } from "./modules/invoices/invoices.controller";
import { publicInvoicesController } from "./modules/invoices/public-invoices.controller";
import { billingInvoicesController } from "./modules/mayar/billing-invoices.controller";
import { mayarController } from "./modules/mayar/mayar.controller";
import { mcpController } from "./modules/mcp/mcp.controller";
import { metricsController } from "./modules/metrics/metrics.controller";
import { notificationSettingsController } from "./modules/notification-settings/notification-settings.controller";
import { notificationsController } from "./modules/notifications/notifications.controller";
import { ordersController } from "./modules/orders/orders.controller";
import { pricingController } from "./modules/pricing/pricing.controller";
import { publicPricingController } from "./modules/pricing/public-pricing.controller";
import { privacyController } from "./modules/privacy/privacy.controller";
import { pushSubscriptionsController } from "./modules/push-subscriptions/push-subscriptions.controller";
import { RealtimeService } from "./modules/realtime/realtime.service";
import { settingsController } from "./modules/settings/settings.controller";
import { systemAdminsController } from "./modules/system-admins/system-admins.controller";
import { systemMetricsController } from "./modules/system-metrics/system-metrics.controller";
import { transactions } from "./modules/transactions/transactions.controller";
import { usersController } from "./modules/users/users.controller";
import { vaultController } from "./modules/vault/vault.controller";
import { walletsController } from "./modules/wallets/wallets.controller";
import { workspacesController } from "./modules/workspaces/workspaces.controller";
import { authPlugin, getAuth } from "./plugins/auth";
import { encryptionPlugin } from "./plugins/encryption";
import { loggerPlugin } from "./plugins/logger";
import { rateLimitPlugin } from "./plugins/rate-limit";

const log = createLogger("api");
const port = Env.API_PORT ?? 3001;

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log.info(`[API] Received ${signal}, starting graceful shutdown...`);

  try {
    await app.stop();
    log.info("[API] HTTP server stopped");

    await db.execute(sql`SELECT 1`);
    const client = (db as any).$client;
    if (client?.end) {
      await client.end();
      log.info("[API] Database connection closed");
    }

    log.info("[API] Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    log.error("[API] Error during shutdown", { error });
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

const apiControllers1 = new Elysia()
  .use(healthController)
  .use(usersController)
  .use(workspacesController)
  .use(authController)
  .use(settingsController)
  .use(categoriesController)
  .use(budgets)
  .use(walletsController)
  .use(vaultController)
  .use(transactions);

const apiControllers2 = new Elysia()
  .use(aiInternalController)
  .use(aiController)
  .use(metricsController)
  .use(integrationsController)
  .use(systemAdminsController)
  .use(pricingController)
  .use(mayarController)
  .use(billingInvoicesController)
  .use(ordersController)
  .use(systemMetricsController)
  .use(privacyController)
  .use(invoicesController);

const apiControllers3 = new Elysia()
  .use(publicInvoicesController)
  .use(contactsController)
  .use(debtsController)
  .use(notificationsController)
  .use(notificationSettingsController)
  .use(pushSubscriptionsController);

const APP_ORIGINS = [
  "https://app.oewang.com",
  "https://console.oewang.com",
  "https://oewang.com",
  ...(process.env.NODE_ENV !== "production"
    ? [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3003",
      ]
    : []),
];

// Paths that must be open to any origin (OAuth, MCP, discovery)
function isPublicOriginPath(pathname: string): boolean {
  return (
    pathname.startsWith("/.well-known") ||
    pathname.startsWith("/oauth") ||
    pathname.startsWith("/mcp")
  );
}

const app = new Elysia()
  .use(
    cors({
      origin: (request: Request) => {
        const pathname = new URL(request.url).pathname;
        if (isPublicOriginPath(pathname)) return true;
        return APP_ORIGINS.includes(request.headers.get("origin") ?? "");
      },
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "x-workspace-id"],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  )
  .use(mcpController)
  .use(staticPlugin({ assets: "public", prefix: "" }))
  .get("/", () => Bun.file("public/index.html"))
  .use(loggerPlugin)
  .use(authPlugin)
  .use(rateLimitPlugin)
  .use(encryptionPlugin)
  .use(
    swagger({
      documentation: {
        info: {
          title: "oewang API",
          version: "1.0.0",
          description: "REST API for oewang — powered by ElysiaJS & Bun",
        },
      },
    }),
  )
  // All routes grouped under /v1
  .group("/v1", (app) =>
    app
      .use(publicWebhooksController)
      .use(apiControllers1)
      .use(apiControllers2)
      .use(apiControllers3)
      .derive(async ({ query, auth, request }) => {
        // Log basic info about the incoming connection attempt
        const ip =
          request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";

        // If already authenticated via header/cookie from authPlugin, use it
        if (auth) {
          log.info(
            `[WS] Authenticated connection from ${ip} (User: ${auth.user_id})`,
          );
          return { wsAuth: auth };
        }

        const token = query.token;
        if (!token) {
          log.warn(`[WS] Missing token and cookie for connection from ${ip}`);
          return { wsAuth: null };
        }

        if (process.env.NODE_ENV === "production") {
          log.warn(`[WS] Query-token auth blocked in production from ${ip}`);
          return { wsAuth: null };
        }

        const ws_auth = await getAuth(token);
        if (!ws_auth) {
          log.warn(`[WS] Invalid token provided from ${ip}`);
        }

        return { wsAuth: ws_auth };
      })
      .ws("/realtime", {
        beforeHandle({ wsAuth, set }) {
          if (!wsAuth) {
            log.warn(
              "[WS] Handshake rejected: No valid session or token found",
            );
            set.status = 401;
            return "Unauthorized";
          }
        },
        open(ws) {
          const workspace_id = ws.data.wsAuth?.workspaceId;
          if (workspace_id) {
            ws.subscribe(workspace_id);
            log.info(
              `[WS] Client connected and subscribed to workspace: ${workspace_id}`,
            );
          } else {
            log.warn("[WS] Client connected but has no workspace_id mapped");
          }
        },
        message(ws, message: any) {
          if (message === "ping") {
            ws.send("pong");
          }
        },
        close(ws) {
          const workspace_id = ws.data.wsAuth?.workspaceId;
          if (workspace_id) {
            ws.unsubscribe(workspace_id);
            log.info(
              `[WS] Client disconnected from workspace: ${workspace_id}`,
            );
          }
        },
      }),
  )
  // Public routes (no auth required)
  .use(publicPricingController)
  // Global error handler — sanitizes and logs all unhandled exceptions
  .onError(({ error, code, set, path }) => {
    const numericCode =
      typeof code === "number"
        ? code
        : typeof code === "string"
          ? parseInt(code, 10)
          : NaN;
    const isClientError =
      !isNaN(numericCode) && (numericCode === 401 || numericCode === 403);

    // Log fatal errors to Sentry
    if (code !== "NOT_FOUND" && !isClientError) {
      Sentry.captureException(error);
      const message =
        error instanceof Error ? error.message : "Handled response";
      const stack = error instanceof Error ? error.stack : undefined;
      // DrizzleQueryError wraps the underlying postgres error in `.cause`,
      // and its `.message` only shows the SQL — surface the real reason.
      const cause = (error as { cause?: unknown })?.cause;
      const causeMessage = cause instanceof Error ? cause.message : undefined;
      const causeStack = cause instanceof Error ? cause.stack : undefined;
      const causeCode =
        cause && typeof cause === "object"
          ? ((cause as { code?: string }).code ??
            (cause as { errno?: string | number }).errno)
          : undefined;

      log.error(`[API] Unhandled Error [${code}]`, {
        message,
        stack,
        path,
        cause_message: causeMessage,
        cause_code: causeCode,
        cause_stack: causeStack,
      });
    }

    // 1. Validation errors (TypeBox/Elysia)
    if (code === "VALIDATION") {
      log.error("[API] Validation Error", {
        body: (error as any).body,
        headers: (error as any).headers,
        summary: (error as any).summary,
      });
      set.status = 400;
      return buildError(
        ErrorCode.VALIDATION_ERROR,
        "The request data is invalid. Please check your input.",
      );
    }

    // 2. Resource not found
    if (code === "NOT_FOUND") {
      set.status = 404;
      return buildError(ErrorCode.NOT_FOUND, "Resource not found");
    }

    // 3. Handle explicit status() calls (number strings) or Error with status property
    if (!isNaN(numericCode) && numericCode >= 400 && numericCode < 600) {
      set.status = numericCode;

      // If the error body is already a buildError result (ApiResponse)
      if (
        error &&
        typeof error === "object" &&
        "success" in error &&
        "code" in error
      ) {
        return error;
      }

      // If it's a wrapped error response
      if (
        error &&
        typeof error === "object" &&
        "success" in error &&
        "code" in error
      ) {
        return error;
      }

      const message =
        error instanceof Error
          ? error.message
          : (error as any)?.message || "An error occurred";
      const errorCode = (error as any).code || ErrorCode.INTERNAL_ERROR;

      return buildError(String(errorCode), message);
    }

    // 4. Database errors (sanitize to hide implementation details)
    const errorMsg = (
      error instanceof Error ? error.message : ""
    ).toLowerCase();
    if (
      errorMsg.includes("db") ||
      errorMsg.includes("query") ||
      errorMsg.includes("postgres") ||
      errorMsg.includes("relation") ||
      errorMsg.includes("foreign key") ||
      errorMsg.includes("constraint")
    ) {
      set.status = 500;
      return buildError(
        ErrorCode.DATABASE_ERROR,
        "A database error occurred. We have been notified.",
      );
    }

    set.status = 500;
    return buildError(
      ErrorCode.INTERNAL_ERROR,
      "An unexpected server error occurred.",
    );
  })
  .listen(port);

// Initialize Realtime Brodcaster
RealtimeService.onDataChanged(({ workspaceId, type }) => {
  log.info(
    `[Realtime] Publishing event '${type}' to workspace '${workspaceId}'`,
  );
  const published = app.server?.publish(
    workspaceId,
    JSON.stringify({ type, timestamp: Date.now() }),
  );
  log.info(`[Realtime] Publish result (subscribers count): ${published}`);
});

log.info(`🚀 oewang API running at http://localhost:${port}`);
log.info(`📖 Swagger docs at http://localhost:${port}/swagger`);
log.info(`🔗 API v1 at http://localhost:${port}/v1`);

registerEvolutionWebhook();
registerTelegramWebhook();

export { app };
export type App = typeof app;
