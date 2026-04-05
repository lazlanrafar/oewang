import { z } from "zod";

const appEnvSchema = z.object({
  // Next.js Public
  NEXT_PUBLIC_APP_URL: z.string().min(1),
  NEXT_PUBLIC_ADMIN_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_API_URL: z.string().min(1),
  NEXT_PUBLIC_WEBSITE_URL: z.string().min(1).optional(),
  

  
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  
  NEXT_PUBLIC_SESSION_COOKIE_NAME: z.string().optional().default("oewang-session"),
  NEXT_PUBLIC_SUPABASE_COOKIE_NAME: z.string().optional(),
  
  NEXT_PUBLIC_WHATSAPP_NUMBER: z.string().optional().default("+1234567890"),
  NEXT_PUBLIC_TWILIO_WHATSAPP_NUMBER: z.string().optional().default("+14155238886"),
  NEXT_PUBLIC_TELEGRAM_BOT_USER: z.string().optional().default("OewangBot"),

  // Server-side used in NextJS App
  ENCRYPTION_KEY: z.string().length(32).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const isServer = typeof window === "undefined";
const isSkipValidation =
  process.env.npm_lifecycle_event === "build" ||
  process.env.NEXT_PHASE !== undefined ||
  process.env.NODE_ENV === "test";

if (isServer && !isSkipValidation) {
  const parsed = appEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "❌ APP Invalid environment variables:",
      JSON.stringify(parsed.error.format(), null, 2)
    );
    throw new Error("Invalid APP environment variables");
  }
}

export const getAppEnv = () => appEnvSchema.parse(process.env);
export type AppEnv = z.infer<typeof appEnvSchema>;
