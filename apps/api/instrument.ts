import { loadEnv } from "@workspace/utils/load-env";

// Load environment variables as first step
loadEnv();

import * as Sentry from "@sentry/bun";
import { Env } from "@workspace/constants";
import { createLogger } from "@workspace/logger";

const log = createLogger("sentry");

const sentryEnabled = !!Env.SENTRY_DSN && Env.NODE_ENV !== "development";

Sentry.init({
  dsn: Env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  enabled: sentryEnabled,
});

if (sentryEnabled) {
  log.info("Sentry initialized for API");
} else if (!Env.SENTRY_DSN) {
  log.warn("SENTRY_DSN not set — Sentry disabled");
} else {
  log.info("Sentry disabled in development (NODE_ENV=development)");
}
