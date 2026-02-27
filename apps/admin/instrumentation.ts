import * as Sentry from "@sentry/nextjs";

export async function register() {
  // Validate environment variables on server startup
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadEnv } = await import("@workspace/utils/load-env");
    loadEnv();
  }

  const { validateEnv } = await import("@workspace/utils/env");
  validateEnv();

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
