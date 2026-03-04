import { loadEnv } from "@workspace/utils/load-env";

// Load environment variables as first step
loadEnv();

import * as Sentry from "@sentry/bun";
import { createLogger } from "@workspace/logger";
import { Env } from "@workspace/constants";

const log = createLogger("sentry");

Sentry.init({
  dsn: Env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  enabled: !!Env.SENTRY_DSN,
});

if (Env.SENTRY_DSN) {
  log.info("Sentry initialized for API");
} else {
  log.warn("SENTRY_DSN not set — Sentry disabled");
}
