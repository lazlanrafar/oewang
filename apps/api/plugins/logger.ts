import { Elysia } from "elysia";
import { createLogger } from "@workspace/logger";

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
        const numericCode = typeof code === "string" ? parseInt(code, 10) : NaN;
        if (!isNaN(numericCode) && numericCode >= 400 && numericCode < 600) {
          statusCode = numericCode;
        }
      }

      let errorMessage = "An error occurred";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      } else if (error && typeof error === "object") {
        errorMessage = (error as any).message || (error as any).code || JSON.stringify(error);
      }

      const logData: any = {
        context: "http",
        method,
        path,
        status: statusCode,
        duration,
        code,
        error: errorMessage,
      };

      // Extract more details if it's a buildError response
      if (error && typeof error === "object" && "code" in error) {
        logData.errorCode = (error as any).errorCode || (error as any).code;
      }

      // 401 and 403 are expected client-side auth state transitions - log as info to reduce noise
      const isAuthError = statusCode === 401 || statusCode === 403;
      const logMethod = statusCode >= 500 ? "error" : isAuthError ? "info" : "warn";

      log[logMethod](`ERROR ${method} ${path} ${statusCode} - ${duration}ms`, logData);
    });
