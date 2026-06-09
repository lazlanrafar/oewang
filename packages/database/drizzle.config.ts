import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
import * as path from "path";

// Only load .env file if DATABASE_URL is not already set in the environment.
// This allows callers to pass --env-file=.env.production (bun) or set DATABASE_URL
// directly (e.g. Railway build step) without it being overridden by the local .env.
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
}

export default defineConfig({
  schema: "./schema/*",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
