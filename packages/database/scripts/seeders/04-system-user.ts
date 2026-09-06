import * as path from "node:path";
import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users } from "../../schema/users";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
}

// Sentinel row for webhook/system-initiated actions (e.g. Mayar payment
// webhooks creating orders with no signed-in actor) that need a real FK-valid
// user_id for audit_logs.user_id / orders.user_id — see orders.service.ts
// SYSTEM_ACTOR and the `auth?.user_id || "system"` fallback used across
// articles/faqs/pricing controllers.
export const SYSTEM_USER_ID = "system";

export async function seedSystemUser() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  console.log("🌱 Seeding system user...");

  await db
    .insert(users)
    .values({
      id: SYSTEM_USER_ID,
      email: "system@oewang.internal",
      name: "System",
      system_role: "user",
    })
    .onConflictDoNothing();

  console.log("✅ System user seeded.\n");

  await client.end();
}

// @ts-expect-error - Bun supports import.meta.main at runtime
if (import.meta.main) {
  seedSystemUser().catch((err) => {
    console.error("❌ Failed:", err);
    process.exit(1);
  });
}
