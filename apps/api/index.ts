// Sentry must be imported first to instrument everything
import "./instrument";

import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import * as Sentry from "@sentry/bun";
import { getApiEnv } from "./config/env";
import { createLogger } from "@workspace/logger";
import { sql } from "drizzle-orm";
import { Elysia } from "elysia";

// Validate API environment variables early
getApiEnv();

import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { staticPlugin } from "@elysiajs/static";
import { Env } from "@workspace/constants";
import { db } from "@workspace/database";
import { aiController } from "./modules/ai/ai.controller";
import { authController } from "./modules/auth/auth.controller";
import { categoriesController } from "./modules/categories/categories.controller";
import { contactsController } from "./modules/contacts/contacts.controller";
import { debtsController } from "./modules/debts/debts.controller";
import { healthController } from "./modules/health/health.controller";
import { integrationsController } from "./modules/integrations/integrations.controller";
import { invoicesController } from "./modules/invoices/invoices.controller";
import { publicInvoicesController } from "./modules/invoices/public-invoices.controller";
import { metricsController } from "./modules/metrics/metrics.controller";
import { ordersController } from "./modules/orders/orders.controller";
import { pricingController } from "./modules/pricing/pricing.controller";
import { publicPricingController } from "./modules/pricing/public-pricing.controller";
import { settingsController } from "./modules/settings/settings.controller";
import { xenditController } from "./modules/xendit/xendit.controller";
import { systemAdminsController } from "./modules/system-admins/system-admins.controller";
import { systemMetricsController } from "./modules/system-metrics/system-metrics.controller";
import { transactions } from "./modules/transactions/transactions.controller";
import { notificationsController } from "./modules/notifications/notifications.controller";
import { notificationSettingsController } from "./modules/notification-settings/notification-settings.controller";
import { usersController } from "./modules/users/users.controller";
import { vaultController } from "./modules/vault/vault.controller";
import { walletsController } from "./modules/wallets/wallets.controller";
import { workspacesController } from "./modules/workspaces/workspaces.controller";
import { authPlugin } from "./plugins/auth";
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

const app = new Elysia()
  .use(cors())
  .use(staticPlugin({ assets: "public", prefix: "" }))
  .get("/", () => Bun.file("public/index.html"))
  .use(loggerPlugin)
  .use(encryptionPlugin)
  .use(authPlugin)
  .use(rateLimitPlugin)
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
      .use(healthController)
      .use(usersController)
      .use(workspacesController)
      .use(authController)
      .use(settingsController)
      .use(categoriesController)
      .use(walletsController)
      .use(vaultController)
      .use(transactions)
      .use(aiController)
      .use(metricsController)
      .use(integrationsController)
      .use(systemAdminsController)
      .use(pricingController)
      .use(xenditController)
      .use(ordersController)
      .use(systemMetricsController)
      .use(invoicesController)
      .use(publicInvoicesController)
      .use(contactsController)
      .use(debtsController)
      .use(notificationsController)
      .use(notificationSettingsController),
  )
  // Public routes (no auth required)
  .use(publicPricingController)
  // Global error handler — sanitizes and logs all unhandled exceptions
  .onError(({ error, code, set, path }) => {
    const numericCode = typeof code === "string" ? parseInt(code, 10) : NaN;
    const isClientError =
      !isNaN(numericCode) && (numericCode === 401 || numericCode === 403);

    // Log fatal errors to Sentry
    if (code !== "NOT_FOUND" && !isClientError) {
      Sentry.captureException(error);
      const message =
        error instanceof Error ? error.message : "Handled response";
      const stack = error instanceof Error ? error.stack : undefined;

      log.error(`[API] Unhandled Error [${code}]`, {
        message,
        stack,
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
      if (error && typeof error === 'object' && 'success' in error && 'code' in error) {
        return error;
      }

      // If it's a wrapped error response
      if (error && typeof (error as any).data === 'object' && (error as any).data !== null) {
          return (error as any).data;
      }

      const message = error instanceof Error ? error.message : "An error occurred";
      const errorCode = (error as any).code || ErrorCode.INTERNAL_ERROR;

      return buildError(
        String(errorCode),
        message,
      );
    }

    // 4. Database errors (sanitize to hide implementation details)
    const errorMsg = (error instanceof Error ? error.message : "").toLowerCase();
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

    // 5. Default: Internal error
    set.status = 500;
    return buildError(
      ErrorCode.INTERNAL_ERROR,
      "An unexpected server error occurred.",
    );
  })
  .listen(port);

log.info(`🚀 oewang API running at http://localhost:${port}`);
log.info(`📖 Swagger docs at http://localhost:${port}/swagger`);
log.info(`🔗 API v1 at http://localhost:${port}/v1`);

export { app };
export type App = typeof app;
