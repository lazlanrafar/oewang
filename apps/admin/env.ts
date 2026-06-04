import { z } from "zod";

const adminEnvSchema = z.object({
  // Next.js Public
  NEXT_PUBLIC_APP_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_ADMIN_URL: z.string().min(1),
  NEXT_PUBLIC_API_URL: z.string().min(1),

  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),

  NEXT_PUBLIC_SESSION_COOKIE_NAME: z.string().optional().default("oewang-session"),

  // Server-side
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const isServer = typeof window === "undefined";
const isSkipValidation =
  process.env.npm_lifecycle_event === "build" ||
  process.env.NEXT_PHASE !== undefined ||
  process.env.NODE_ENV === "test";

if (isServer && !isSkipValidation) {
  const parsed = adminEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "❌ ADMIN Invalid environment variables:",
      JSON.stringify(parsed.error.format(), null, 2)
    );
    throw new Error("Invalid ADMIN environment variables");
  }
}

export const getAdminEnv = () => adminEnvSchema.parse(process.env);
export type AdminEnv = z.infer<typeof adminEnvSchema>;
