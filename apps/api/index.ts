// Sentry must be imported first to instrument everything
import "./instrument";

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import * as Sentry from "@sentry/bun";
import { createLogger } from "@workspace/logger";
import { validateEnv } from "./config/env";
// Validate environment variables early
validateEnv();

import { authPlugin } from "./plugins/auth";
import { encryptionPlugin } from "./plugins/encryption";
import { rateLimitPlugin } from "./plugins/rate-limit";
import { loggerPlugin } from "./plugins/logger";
import { staticPlugin } from "@elysiajs/static";
import { healthController } from "./modules/health";
import { settingsController } from "./modules/settings/settings.controller";

import { usersController } from "./modules/users/users.controller";
import { workspacesController } from "./modules/workspaces/workspaces.controller";
import { authController } from "./modules/auth/auth.controller";
import { categoriesController } from "./modules/categories/categories.controller";
import { walletsController } from "./modules/wallets/wallets.controller";
import { vaultController } from "./modules/vault/vault.controller";
import { transactions } from "./modules/transactions/transactions.controller";
import { aiController } from "./modules/ai/ai.controller";
import { metricsController } from "./modules/metrics/metrics.controller";
import { integrationsController } from "./modules/integrations/integrations.controller";
import { systemAdminsController } from "./modules/system-admins/system-admins.controller";
import { pricingController } from "./modules/pricing/pricing.controller";
import { stripeController } from "./modules/stripe/stripe.controller";
import { ordersController } from "./modules/orders/orders.controller";

const log = createLogger("api");
const port = process.env.API_PORT ?? 3001;

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
          title: "Okane API",
          version: "1.0.0",
          description: "REST API for Okane — powered by ElysiaJS & Bun",
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
      .use(stripeController)
      .use(ordersController),
  )
  .onError(({ error, code }) => {
    if (code === "NOT_FOUND") return;
    Sentry.captureException(error);
  })
  .listen(port);

log.info(`🦊 Okane API running at http://localhost:${port}`);
log.info(`📖 Swagger docs at http://localhost:${port}/swagger`);
log.info(`🔗 API v1 at http://localhost:${port}/v1`);

export { app };
export type App = typeof app;
