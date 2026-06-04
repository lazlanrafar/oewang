import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql, eq } from "drizzle-orm";
import * as dotenv from "dotenv";
import * as path from "path";
import { users } from "../../schema/users";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
}

const ADMIN_EMAIL = "lazlanrafar@gmail.com";

export async function seedAdminUser() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  console.log("🌱 Seeding admin user...");

  const existing = await db.execute(
    sql`SELECT id FROM users WHERE lower(email) = lower(${ADMIN_EMAIL}) LIMIT 1`,
  );

  if (existing.length > 0) {
    const userId = (existing[0] as any).id;
    await db
      .update(users)
      .set({ system_role: "superadmin" })
      .where(eq(users.id, userId));
    console.log(`  ↻  Updated database: "${ADMIN_EMAIL}" → superadmin`);
  } else {
    const [inserted] = await db
      .insert(users)
      .values({
        email: ADMIN_EMAIL,
        name: "Lazlan Rafar",
        system_role: "superadmin",
      })
      .returning({ id: users.id, email: users.email });
    console.log(`  ✓  Created in database: "${inserted!.email}" → superadmin`);
  }

  await client.end();
  console.log("✅ Admin user seeded.\n");
}

// @ts-ignore - Bun supports import.meta.main at runtime
if (import.meta.main) {
  seedAdminUser().catch((err) => {
    console.error("❌ Failed:", err);
    process.exit(1);
  });
}
