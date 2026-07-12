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

  // API
  API_PORT: z.string().optional().default("3002"),

  // Database
  DATABASE_URL: z.string().min(1),

  // OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  // Server-to-server secret gating /auth/oauth/connect. Only the Next.js OAuth
  // callback (which has already verified the user with the provider) may mint a
  // session. Optional in schema, but the endpoint fails closed when unset.
  OAUTH_CONNECT_SECRET: z.string().min(16).optional(),

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
  // ENCRYPTION_KEY is the TRANSPORT key — it is bundled into the web/native
  // clients so they can decrypt API responses. Never use it for at-rest data.
  ENCRYPTION_KEY: z.string().length(32),
  // DATA_ENCRYPTION_KEY is the AT-REST key for stored secrets (integration OAuth
  // tokens, workspace API keys, vault). SERVER-ONLY — never shipped to a client.
  // Optional so existing deploys don't break; at-rest crypto falls back to
  // ENCRYPTION_KEY when unset. Set a distinct 32-char key + re-encrypt to rotate.
  DATA_ENCRYPTION_KEY: z.string().length(32).optional(),

  // Redis
  REDIS_URL: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // External Services
  CURRENCYFREAKS_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // Gmail OAuth
  GOOGLE_GMAIL_CLIENT_ID: z.string().optional(),
  GOOGLE_GMAIL_CLIENT_SECRET: z.string().optional(),

  // Outlook / Microsoft OAuth
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),

  // Evolution API (WhatsApp)
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_TOKEN: z.string().optional(),
  EVOLUTION_API_INSTANCE: z.string().optional(),

  // Python AI sidecar (apps/ai). When AI_SERVICE_URL is set, chat (WhatsApp/
  // Telegram AND the website canvas chat) is served by it, with an in-process
  // fallback if the sidecar is unreachable.
  AI_SERVICE_URL: z.string().url().optional(),
  // Shared secret gating the sidecar<->api round trip. Required: a missing key
  // must fail closed (reject), never disable auth. See ai-internal.controller.ts
  // and apps/ai auth middleware.
  AI_SERVICE_API_KEY: z.string().min(16),

  // S3-compatible Storage
  BUCKET_ENDPOINT: z.string().min(1).optional(),
  BUCKET_REGION: z.string().optional().default("us-east-1"),
  BUCKET_ACCESS_KEY_ID: z.string().optional(),
  BUCKET_SECRET_ACCESS_KEY: z.string().optional(),
  BUCKET_NAME: z.string().optional(),

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

  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SESSION_COOKIE_NAME: z
    .string()
    .optional()
    .default("oewang-session"),
  NEXT_PUBLIC_WHATSAPP_NUMBER: z.string().optional(),
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

  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SESSION_COOKIE_NAME: process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME,
  NEXT_PUBLIC_WHATSAPP_NUMBER: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
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
        console.warn(
          "⚠️ getEnv: Could not find .env file within 3 levels of process.cwd()",
        );
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
