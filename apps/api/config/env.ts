import { z } from "zod";

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Auth
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().optional().default("7d"),

  // API
  API_PORT: z.string().optional().default("3002"),
  API_BASE_URL: z.string().url(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  // Monitoring
  SENTRY_DSN: z.string().optional(),

  // Encryption
  ENCRYPTION_KEY: z.string().length(32),

  // Redis (optional in dev — in-memory fallback)
  REDIS_URL: z.string().url().optional(),

  // Logging
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .optional()
    .default("info"),
  LOG_PRETTY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables at API startup.
 * Throws if any required vars are missing/invalid.
 */
export function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    throw new Error("Invalid environment variables");
  }

  return parsed.data;
}

export const env = process.env as unknown as Env;
