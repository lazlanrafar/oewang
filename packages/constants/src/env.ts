import { z } from "zod";

/**
 * Server-only environment variables schema
 * These variables will ONLY be validated on the server.
 */
const serverSchema = z.object({
  // Application
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: z.string().min(1).optional(),
  ADMIN_URL: z.string().min(1).optional(),
  API_URL: z.string().min(1).optional(),
  WEBSITE_URL: z.string().min(1).optional(),

  // API
  API_PORT: z.string().optional().default("3002"),
  API_BASE_URL: z.string().min(1).optional(),

  // Database
  DATABASE_URL: z.string().min(1),

  // Auth
  SUPABASE_URL: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().optional().default("7d"),

  // Mayar
  MAYAR_API_URL: z.string().url().optional(),
  MAYAR_API_KEY: z.string().optional(),
  MAYAR_WEBHOOK_TOKEN: z.string().optional(),

  // AI
  OPENAI_API_KEY: z.string().min(1).optional().or(z.literal("")),
  GEMINI_API_KEY: z.string().min(1).optional().or(z.literal("")),
  ANTHROPIC_API_KEY: z.string().min(1).optional().or(z.literal("")),

  // Encryption
  ENCRYPTION_KEY: z.string().length(32),

  // Redis
  REDIS_URL: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // External Services
  CURRENCYFREAKS_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_NUMBER: z.string().optional(),

  // R2 Storage
  R2_ENDPOINT: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),

  // Monitoring
  SENTRY_DSN: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  // Logging
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .optional()
    .default("info"),
  LOG_PRETTY: z.string().optional().default("true"),
  LOGS_DIR: z.string().optional(),
});

/**
 * Client-accessible environment variables schema (must trigger NEXT_PUBLIC_ in Next.js)
 * These variables will be available on both the client and server.
 */
const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().min(1),
  NEXT_PUBLIC_ADMIN_URL: z.string().min(1),
  NEXT_PUBLIC_API_URL: z.string().min(1),
  NEXT_PUBLIC_WEBSITE_URL: z.string().min(1).optional(),

  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SESSION_COOKIE_NAME: z
    .string()
    .optional()
    .default("oewang-session"),
  NEXT_PUBLIC_SUPABASE_COOKIE_NAME: z.string().optional(),
  NEXT_PUBLIC_TWILIO_WHATSAPP_NUMBER: z.string().optional().default("+14155238886"),
  NEXT_PUBLIC_TELEGRAM_BOT_USER: z.string().optional().default("OewangBot"),
});

// Create the combined env object manually for Next.js bundle resolution.
// In Next.js, process.env.NEXT_PUBLIC_* is replaced statically at build time.
// We cannot dynamically iterate process.env to extract them.
const clientEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_WEBSITE_URL: process.env.NEXT_PUBLIC_WEBSITE_URL,

  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SESSION_COOKIE_NAME: process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME,
  NEXT_PUBLIC_SUPABASE_COOKIE_NAME:
    process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME,
  NEXT_PUBLIC_TWILIO_WHATSAPP_NUMBER: process.env.NEXT_PUBLIC_TWILIO_WHATSAPP_NUMBER,
  NEXT_PUBLIC_TELEGRAM_BOT_USER: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USER,
};

let _env: z.infer<typeof serverSchema> & z.infer<typeof clientSchema>;

export const getEnv = () => {
  if (_env) {
    return _env;
  }
  const isServer = typeof window === "undefined";
  const isSkipValidation =
    process.env.npm_lifecycle_event === "build" ||
    process.env.NEXT_PHASE !== undefined ||
    process.env.NODE_ENV === "test";
  
  if (isServer) {
    try {
      // Use require for Node.js-only modules inside the isServer block to avoid client bundle crashes
      const dotenv = require("dotenv");
      const fs = require("fs");
      const path = require("path");

      // Inline loadEnv logic to ensure it's ALWAYS available even if require fails
      let current = process.cwd();
      let loaded = false;
      for (let i = 0; i < 3; i++) {
        const envPath = path.join(current, ".env");
        if (!isSkipValidation) {
           console.log(`🔍 getEnv: Searching for .env at: ${envPath}`);
        }
        if (fs.existsSync(envPath)) {
          dotenv.config({ path: envPath });
          if (!isSkipValidation) {
            console.log(`✅ getEnv: Loaded env from ${envPath}`);
          }
          loaded = true;
          break;
        }
        current = path.dirname(current);
      }
      if (!loaded && !isSkipValidation) {
        console.warn("⚠️ getEnv: Could not find .env file within 3 levels of process.cwd()");
      }
    } catch (e) {
      if (!isSkipValidation) {
        console.warn("⚠️ getEnv: Inline loadEnv() failed.", e);
      }
    }

    // The actual validation is deferred to the individual applications
    // (e.g. apps/api/config/env.ts, apps/app/env.ts)
    _env = {
      ...process.env,
      ...clientEnv,
    } as any;
  } else {
    // Client-side environment reads rely strictly on clientEnv static resolution
    _env = clientEnv as any;
  }

  return _env;
};

// Also export a proxy for convenience (e.g., Env.NEXT_PUBLIC_APP_URL)
export const Env = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      return getEnv()[prop as keyof typeof _env];
    },
  },
) as z.infer<typeof serverSchema> & z.infer<typeof clientSchema>;

// Ensure validation runs immediately on import if we're on the server.
// However, avoid doing this at the top level to prevent crashes before instrumentation.ts can run loadEnv.
// getEnv();
