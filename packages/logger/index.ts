import pino from "pino";
import path from "node:path";
import fs from "node:fs";
import { Env } from "@workspace/constants";

const isPretty =
  Env.LOG_PRETTY === "true" || Env.LOG_PRETTY === "1";

// Ensure logs directory exists at the monorepo root
const logsDir = path.resolve(process.cwd(), Env.LOGS_DIR ?? "logs");
fs.mkdirSync(logsDir, { recursive: true });

const logFilePath = path.join(logsDir, "app.log.txt");

/**
 * Create the base pino logger instance
 */
const baseLogger = pino({
  level: Env.LOG_LEVEL || "info",
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
  // Use pretty printing in development, structured JSON in production
  ...(isPretty && {
    transport: {
      targets: [
        {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
            messageFormat: "{msg}",
            hideObject: false,
            singleLine: false,
            useLevelLabels: true,
            levelFirst: true,
          },
          level: Env.LOG_LEVEL || "info",
        },
        {
          target: "pino/file",
          options: { destination: logFilePath, mkdir: true },
          level: Env.LOG_LEVEL || "info",
        },
      ],
    },
  }),
  // In production (non-pretty), write JSON to both stdout and file
  ...(!isPretty && {
    transport: {
      targets: [
        {
          target: "pino/file",
          options: { destination: 1 }, // stdout
          level: Env.LOG_LEVEL || "info",
        },
        {
          target: "pino/file",
          options: { destination: logFilePath, mkdir: true },
          level: Env.LOG_LEVEL || "info",
        },
      ],
    },
  }),
});

/**
 * Logger adapter interface
 */
export interface LoggerAdapter {
  info: (message: string, data?: object) => void;
  error: (message: string, data?: object) => void;
  warn: (message: string, data?: object) => void;
  debug: (message: string, data?: object) => void;
}

/**
 * Create a logger adapter that wraps pino to match a simple API
 */
function createLoggerAdapter(
  pinoLogger: pino.Logger,
  prefixContext?: string,
): LoggerAdapter {
  // Format context with brackets if not already formatted
  const formatContext = (ctx?: string): string => {
    if (!ctx) return "";
    // If already has brackets, use as-is, otherwise wrap in brackets
    if (ctx.startsWith("[") && ctx.endsWith("]")) {
      return ctx;
    }
    return `[${ctx}]`;
  };

  const formattedContext = formatContext(prefixContext);

  return {
    info: (message: string, data?: object) => {
      try {
        const fullMessage = formattedContext
          ? `${formattedContext} ${message}`
          : message;
        if (data) {
          pinoLogger.info(data, fullMessage);
        } else {
          pinoLogger.info(fullMessage);
        }
      } catch {
        // Silently ignore logger stream errors to prevent crashes
      }
    },
    error: (message: string, data?: object) => {
      try {
        const fullMessage = formattedContext
          ? `${formattedContext} ${message}`
          : message;
        if (data) {
          pinoLogger.error(data, fullMessage);
        } else {
          pinoLogger.error(fullMessage);
        }
      } catch {
        // Silently ignore logger stream errors to prevent crashes
      }
    },
    warn: (message: string, data?: object) => {
      try {
        const fullMessage = formattedContext
          ? `${formattedContext} ${message}`
          : message;
        if (data) {
          pinoLogger.warn(data, fullMessage);
        } else {
          pinoLogger.warn(fullMessage);
        }
      } catch {
        // Silently ignore logger stream errors to prevent crashes
      }
    },
    debug: (message: string, data?: object) => {
      try {
        const fullMessage = formattedContext
          ? `${formattedContext} ${message}`
          : message;
        if (data) {
          pinoLogger.debug(data, fullMessage);
        } else {
          pinoLogger.debug(fullMessage);
        }
      } catch {
        // Silently ignore logger stream errors to prevent crashes
      }
    },
  };
}

/**
 * Default logger instance
 */
export const logger = createLoggerAdapter(baseLogger);

/**
 * Create a child logger with additional context
 * @param context - Context string to prepend to all log messages
 * @returns A new logger instance with the context
 *
 * @example
 * ```ts
 * const log = createLogger("my-component");
 * log.info("Processing", { userId: 123 });
 * // Output: [my-component] Processing { userId: 123 }
 * ```
 */
export function createLogger(context: string): LoggerAdapter {
  const childLogger = baseLogger.child({ context });
  return createLoggerAdapter(childLogger, context);
}

export default logger;
