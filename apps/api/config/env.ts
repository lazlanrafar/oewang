import { z } from "zod";

const apiEnvSchema = z.object({
  // Application
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: z.string().min(1).optional(),
  API_PORT: z.string().optional().default("3002"),
  API_BASE_URL: z.string().min(1).optional(),

  // Database
  DATABASE_URL: z.string().min(1),

  // Auth & Security
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().optional().default("7d"),
  ENCRYPTION_KEY: z.string().length(32),

  // Redis
  REDIS_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Mayar
  MAYAR_API_URL: z.string().url().optional(),
  MAYAR_API_KEY: z
    .string()
    .superRefine((val, ctx) => {
      if (process.env.NODE_ENV === "production" && !val) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MAYAR_API_KEY is required in production",
          path: ["MAYAR_API_KEY"],
        });
      }
    })
    .optional(),
  MAYAR_WEBHOOK_TOKEN: z
    .string()
    .superRefine((val, ctx) => {
      if (process.env.NODE_ENV === "production" && !val) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MAYAR_WEBHOOK_TOKEN is required in production",
          path: ["MAYAR_WEBHOOK_TOKEN"],
        });
      }
    })
    .optional(),

  // AI
  OPENAI_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // Web Push (VAPID)
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),

  // Email
  RESEND_API_KEY: z.string().optional(),

  // External Services
  CURRENCYFREAKS_API_KEY: z.string().optional(),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // Evolution API (WhatsApp)
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_TOKEN: z.string().optional(),
  EVOLUTION_API_INSTANCE: z.string().optional(),

  // S3-compatible Storage
  BUCKET_ENDPOINT: z.string().min(1).optional(),
  BUCKET_REGION: z.string().optional().default("us-east-1"),
  BUCKET_ACCESS_KEY_ID: z.string().optional(),
  BUCKET_SECRET_ACCESS_KEY: z.string().optional(),
  BUCKET_NAME: z.string().optional(),

  // Monitoring
  SENTRY_DSN: z.string().optional(),

  // Logging
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .optional()
    .default("info"),
  LOG_PRETTY: z.string().optional().default("true"),
  LOGS_DIR: z.string().optional(),

  // Next.js specific (occasionally used in API for redirects or logic)
  NEXT_PUBLIC_APP_URL: z.string().min(1).optional(),
});

const isServer = typeof window === "undefined";
const isSkipValidation =
  process.env.npm_lifecycle_event === "build" ||
  process.env.NODE_ENV === "test";

if (isServer && !isSkipValidation) {
  const parsed = apiEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "❌ API Invalid environment variables:",
      JSON.stringify(parsed.error.format(), null, 2),
    );
    throw new Error("Invalid API environment variables");
  }
}

export const getApiEnv = () => apiEnvSchema.parse(process.env);
export type ApiEnv = z.infer<typeof apiEnvSchema>;
