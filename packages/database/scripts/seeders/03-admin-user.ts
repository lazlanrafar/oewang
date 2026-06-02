import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql, eq } from "drizzle-orm";
import * as dotenv from "dotenv";
import * as path from "path";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { users } from "../../schema/users";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
}

const ADMIN_EMAIL = "lazlanrafar@gmail.com";

export async function seedAdminUser() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  console.log("🌱 Seeding admin user...");

  // 1. Update/create in database
  const existing = await db.execute(
    sql`SELECT id FROM users WHERE lower(email) = lower(${ADMIN_EMAIL}) LIMIT 1`,
  );

  let userId: string;

  if (existing.length > 0) {
    userId = (existing[0] as any).id;
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
    userId = inserted!.id;
    console.log(`  ✓  Created in database: "${inserted!.email}" → superadmin`);
  }

  // 2. Update Supabase Auth metadata
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.log("  ⚠️  Skipping Supabase auth update: missing credentials");
    } else {
      const supabase = createSupabaseClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      // Find user in Supabase Auth by email
      const { data: authUser, error: getUserError } =
        await supabase.auth.admin.getUserById(userId);

      if (getUserError || !authUser.user) {
        // Try to find by email if getUserById fails
        const { data: listData } = await supabase.auth.admin.listUsers();
        const userByEmail = listData.users.find(
          (u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
        );

        if (userByEmail) {
          const { error: updateError } =
            await supabase.auth.admin.updateUserById(userByEmail.id, {
              app_metadata: {
                ...userByEmail.app_metadata,
                system_role: "superadmin",
              },
            });

          if (updateError) {
            console.log(
              `  ⚠️  Failed to update Supabase auth metadata: ${updateError.message}`,
            );
          } else {
            console.log(`  ✓  Updated Supabase auth metadata`);
          }
        } else {
          console.log(
            `  ⚠️  User not found in Supabase Auth - please sign in once to create auth record`,
          );
        }
      } else {
        const { error: updateError } =
          await supabase.auth.admin.updateUserById(userId, {
            app_metadata: {
              ...authUser.user.app_metadata,
              system_role: "superadmin",
            },
          });

        if (updateError) {
          console.log(
            `  ⚠️  Failed to update Supabase auth metadata: ${updateError.message}`,
          );
        } else {
          console.log(`  ✓  Updated Supabase auth metadata`);
        }
      }
    }
  } catch (error: any) {
    console.log(`  ⚠️  Error updating Supabase auth: ${error.message}`);
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
