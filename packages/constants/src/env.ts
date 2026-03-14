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
  APP_URL: z.string().url().optional(),
  ADMIN_URL: z.string().url().optional(),
  API_URL: z.string().url().optional(),

  // API
  API_PORT: z.string().optional().default("3002"),
  API_BASE_URL: z.string().url().optional(),

  // Database
  DATABASE_URL: z.string().url(),

  // Auth
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().optional().default("7d"),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // AI
  OPENAI_API_KEY: z.string().min(1).optional().or(z.literal("")),
  GEMINI_API_KEY: z.string().min(1).optional().or(z.literal("")),
  ANTHROPIC_API_KEY: z.string().min(1).optional().or(z.literal("")),

  // Encryption
  ENCRYPTION_KEY: z.string().length(32),

  // Redis
  REDIS_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // External Services
  CURRENCYFREAKS_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  // R2 Storage
  R2_ENDPOINT: z.string().url().optional(),
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
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_ADMIN_URL: z.string().url(),
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SESSION_COOKIE_NAME: z
    .string()
    .optional()
    .default("okane-session"),
  NEXT_PUBLIC_SUPABASE_COOKIE_NAME: z.string().optional(),
  NEXT_PUBLIC_WHATSAPP_NUMBER: z.string().optional().default("+1234567890"),
  NEXT_PUBLIC_TELEGRAM_BOT_USER: z.string().optional().default("OkaneBot"),
});

// Create the combined env object manually for Next.js bundle resolution.
// In Next.js, process.env.NEXT_PUBLIC_* is replaced statically at build time.
// We cannot dynamically iterate process.env to extract them.
const clientEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SESSION_COOKIE_NAME: process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME,
  NEXT_PUBLIC_SUPABASE_COOKIE_NAME:
    process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME,
  NEXT_PUBLIC_WHATSAPP_NUMBER: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
  NEXT_PUBLIC_TELEGRAM_BOT_USER: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USER,
};

let _env: z.infer<typeof serverSchema> & z.infer<typeof clientSchema>;

export const getEnv = () => {
  if (_env) {
    return _env;
  }

  const isServer = typeof window === "undefined";

  if (isServer) {
    // Validate both client and server schemas on the server
    const parsedServer = serverSchema.safeParse(process.env);
    const parsedClient = clientSchema.safeParse(clientEnv);

    if (!parsedServer.success || !parsedClient.success) {
      // In Next.js static builds, we might not have the full server environment.
      // Skip strict server validation if it fails during the build step, unless we actually want to fail.
      const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE !== undefined;

      console.error(
        "❌ Invalid environment variables:",
        JSON.stringify(
          {
            server: parsedServer.success
              ? undefined
              : parsedServer.error.format(),
            client: parsedClient.success
              ? undefined
              : parsedClient.error.format(),
          },
          null,
          2,
        ),
      );
      if (!isNextBuild) {
        throw new Error("Invalid environment variables");
      } else {
        console.warn(
          "⚠️ Skipping hard validation failure because we are in a build step.",
        );
      }
    }

    _env = {
      ...(parsedServer.data || {}),
      ...(parsedClient.data || {}),
    } as any;
  } else {
    // Validate only client schema on the client
    const parsedClient = clientSchema.safeParse(clientEnv);

    if (!parsedClient.success) {
      console.error(
        "❌ Invalid environment variables:",
        JSON.stringify(parsedClient.error.format(), null, 2),
      );
      throw new Error("Invalid environment variables");
    }

    _env = parsedClient.data as any; // Cast because server vars aren't available
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
