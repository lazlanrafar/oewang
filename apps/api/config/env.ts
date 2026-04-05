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
  SUPABASE_URL: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().optional().default("7d"),
  ENCRYPTION_KEY: z.string().length(32),

  // Redis
  REDIS_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Xendit
  XENDIT_SECRET_KEY: z.string().superRefine((val, ctx) => {
    if (process.env.NODE_ENV === "production" && !val) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "XENDIT_SECRET_KEY is required in production",
        path: ["XENDIT_SECRET_KEY"],
      });
    }
  }).optional(),
  XENDIT_CALLBACK_TOKEN: z.string().superRefine((val, ctx) => {
    if (process.env.NODE_ENV === "production" && !val) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "XENDIT_CALLBACK_TOKEN is required in production",
        path: ["XENDIT_CALLBACK_TOKEN"],
      });
    }
  }).optional(),

  // AI
  OPENAI_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // Email
  RESEND_API_KEY: z.string().optional(),

  // External Services
  CURRENCYFREAKS_API_KEY: z.string().optional(),

  // WhatsApp / Twilio / Telegram
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_NUMBER: z.string().optional(),

  // Cloudflare R2
  R2_ENDPOINT: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),

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
  NEXT_PUBLIC_SUPABASE_COOKIE_NAME: z.string().optional(),
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
