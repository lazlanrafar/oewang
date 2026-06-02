/**
 * run-migrate.ts
 *
 * Runs drizzle-kit migrate using the DATABASE_URL already in process.env.
 * Called via: bun --env-file=../../.env.production scripts/run-migrate.ts
 *
 * drizzle-kit's CLI doesn't honour --env-file itself, but bun --env-file
 * pre-populates process.env before this script runs. drizzle.config.ts
 * then reads DATABASE_URL from process.env (it now skips loading .env
 * when DATABASE_URL is already set).
 */
import { spawn } from "bun";
import * as path from "path";

const db_url = process.env.DATABASE_URL;
if (!db_url) {
  console.error("❌ DATABASE_URL is not set. Pass --env-file or export it first.");
  process.exit(1);
}

console.log("⏳ Running drizzle-kit migrate...");

const proc = spawn(
  ["bunx", "drizzle-kit", "migrate"],
  {
    cwd: path.resolve(__dirname, ".."),
    env: process.env as Record<string, string>,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  },
);

async function main() {
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error(`❌ drizzle-kit migrate failed (exit ${exitCode})`);
    process.exit(exitCode);
  }
  console.log("✅ Migrations applied successfully.");
}

main().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
