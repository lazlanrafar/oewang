import { db, users, eq } from "./packages/database";

async function main() {
  await db
    .update(users)
    .set({ is_super_admin: true })
    .where(eq(users.email, "lazlanrafar@gmail.com"));
  console.log("Updated lazlanrafar@gmail.com to super admin");
  process.exit(0);
}

main().catch(console.error);
