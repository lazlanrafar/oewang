import { z } from "zod";

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Auth
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // API
  API_PORT: z.string().optional().default("3002"),

  // Monitoring
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  // Encryption
  ENCRYPTION_KEY: z.string().length(32),

  // API Client
  API_URL: z.string().url().optional().default("http://localhost:3002"),
  NEXT_PUBLIC_API_URL: z
    .string()
    .url()
    .optional()
    .default("http://localhost:3002"),

  // Frontend Supabase (Optional but recommended)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),

  // Logging
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .optional()
    .default("info"),
  LOG_PRETTY: z.string().optional(), // "true" or "false"
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables and throws if any are missing/invalid.
 * Use this at application startup.
 */
export function validateEnv(): Env {
  // Parse process.env
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    throw new Error("Invalid environment variables");
  }

  return parsed.data;
}

// Export a typed process.env proxy (optional, but validateEnv is safer)
export const env = process.env as unknown as Env;
