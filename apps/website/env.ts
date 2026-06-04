import { z } from "zod";

const websiteEnvSchema = z.object({
  // Next.js Public
  NEXT_PUBLIC_APP_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_WEBSITE_URL: z.string().min(1),
  NEXT_PUBLIC_API_URL: z.string().min(1).optional(),

  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),

  // Server-side
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const isServer = typeof window === "undefined";
const isSkipValidation =
  process.env.npm_lifecycle_event === "build" ||
  process.env.NEXT_PHASE !== undefined ||
  process.env.NODE_ENV === "test";

if (isServer && !isSkipValidation) {
  const parsed = websiteEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ WEBSITE Invalid environment variables:", JSON.stringify(parsed.error.format(), null, 2));
    throw new Error("Invalid WEBSITE environment variables");
  }
}

export const getWebsiteEnv = () => websiteEnvSchema.parse(process.env);
export type WebsiteEnv = z.infer<typeof websiteEnvSchema>;
