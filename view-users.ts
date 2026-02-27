import { db, users } from "./packages/database";

async function main() {
  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      is_super_admin: users.is_super_admin,
    })
    .from(users);
  console.log("Current Users Settings", allUsers);
  process.exit(0);
}

main().catch(console.error);
