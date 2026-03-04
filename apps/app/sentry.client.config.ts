import * as Sentry from "@sentry/nextjs";
import { Env } from "@workspace/constants";

Sentry.init({
  dsn: Env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
  enabled: !!Env.NEXT_PUBLIC_SENTRY_DSN,
});
