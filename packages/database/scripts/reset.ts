import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set in .env");
  process.exit(1);
}

async function main() {
  // 1. Wipe the public schema
  console.log("⏳ Dropping public schema...");
  const client = postgres(DATABASE_URL!, { prepare: false });
  const db = drizzle(client);
  await db.execute(sql`DROP SCHEMA public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await db.execute(sql`GRANT ALL ON SCHEMA public TO postgres`);
  await db.execute(sql`GRANT ALL ON SCHEMA public TO public`);
  await client.end();
  console.log("✅ Schema wiped.\n");

  // 2. Push current Drizzle schema to the empty database
  console.log("⏳ Applying schema (drizzle-kit push)...");
  const push = Bun.spawnSync(["bun", "run", "push"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if (push.exitCode !== 0) {
    console.error("❌ Schema push failed");
    process.exit(1);
  }
  console.log("✅ Schema applied.\n");

  // 3. Seed reference data
  const { seedPlans } = await import("./seeders/01-plans");
  const { seedAddons } = await import("./seeders/02-addons");
  await seedPlans();
  await seedAddons();

  console.log("🎉 Done. Database is clean and ready for testing.");
}

main().catch((err) => {
  console.error("❌ Reset failed:", err);
  process.exit(1);
});
