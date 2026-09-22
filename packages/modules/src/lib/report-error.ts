export async function reportActionError(
  error: unknown,
  context: { action: string },
): Promise<void> {
  console.error(`[${context.action}]`, error);
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error, { tags: { action: context.action } });
  } catch {
    // Sentry import failing must never break the caller's error response.
  }
}
