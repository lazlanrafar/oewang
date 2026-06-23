import * as path from "node:path";
import * as dotenv from "dotenv";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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

  const passwordHash = await Bun.password.hash("password");

  if (existing.length > 0) {
    const userId = (existing[0] as any).id;
    await db
      .update(users)
      .set({
        system_role: "superadmin",
        password_hash: passwordHash,
      })
      .where(eq(users.id, userId));
    console.log(
      `  ↻  Updated database: "${ADMIN_EMAIL}" → superadmin with default password`,
    );
  } else {
    const [inserted] = await db
      .insert(users)
      .values({
        email: ADMIN_EMAIL,
        name: "L Azlan Rafar",
        system_role: "superadmin",
        password_hash: passwordHash,
      })
      .returning({ id: users.id, email: users.email });
    console.log(
      `  ✓  Created in database: "${inserted!.email}" → superadmin with default password`,
    );
  }

  await client.end();
  console.log("✅ Admin user seeded.\n");
}

// @ts-expect-error - Bun supports import.meta.main at runtime
if (import.meta.main) {
  seedAdminUser().catch((err) => {
    console.error("❌ Failed:", err);
    process.exit(1);
  });
}
