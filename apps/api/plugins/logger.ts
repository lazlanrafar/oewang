import { createLogger } from "@workspace/logger";
import type { Elysia } from "elysia";

const log = createLogger("http");

export const loggerPlugin = (app: Elysia) =>
  app
    .derive(() => ({
      startTime: Date.now(),
    }))
    .onAfterHandle(({ request, set, startTime }) => {
      const duration = Date.now() - startTime;
      const { method, url } = request;
      const path = new URL(url).pathname;

      const statusCode = typeof set.status === "number" ? set.status : 200;
      const logMethod = statusCode >= 400 ? "warn" : "info";

      log[logMethod](`${method} ${path} ${statusCode} - ${duration}ms`, {
        method,
        path,
        status: statusCode,
        duration,
      });
    })
    // Access-log only — this fires BEFORE the global onError in index.ts (it's
    // registered earlier in the chain), so it can't rely on that handler's
    // set.status yet. It owns exactly one job: the "ERROR method path status -
    // duration" line. Deciding error *shape* (message, error code, DB-message
    // sanitization) and calling Sentry belongs solely to index.ts's onError —
    // duplicating that logic here made every unhandled error log twice with
    // overlapping, sometimes-inconsistent content.
    .onError(({ request, error, code, set, startTime }) => {
      const duration = startTime ? Date.now() - startTime : 0;
      const { method, url } = request;
      const path = new URL(url).pathname;

      // Extract numeric status code from error or set.status
      let statusCode = 500;
      if (typeof set.status === "number" && set.status !== 500) {
        statusCode = set.status;
      } else if (error && typeof (error as any).status === "number") {
        statusCode = (error as any).status;
      } else {
        // `code` is a number for thrown status(n, ...) and a string otherwise.
        const numericCode =
          typeof code === "number"
            ? code
            : typeof code === "string"
              ? parseInt(code, 10)
              : NaN;
        if (!isNaN(numericCode) && numericCode >= 400 && numericCode < 600) {
          statusCode = numericCode;
        }
      }

      // 401 and 403 are expected client-side auth state transitions - log as info to reduce noise
      const isAuthError = statusCode === 401 || statusCode === 403;
      const logMethod =
        statusCode >= 500 ? "error" : isAuthError ? "info" : "warn";

      log[logMethod](`ERROR ${method} ${path} ${statusCode} - ${duration}ms`, {
        context: "http",
        method,
        path,
        status: statusCode,
        duration,
      });
    });
