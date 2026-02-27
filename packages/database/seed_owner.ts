import { db } from "./client.ts";
import { users } from "./schema/users.ts";
import { eq } from "drizzle-orm";

async function main() {
  await db.update(users).set({ system_role: "owner" }).where(eq(users.email, "lazlanrafar@gmail.com"));
  console.log("Seeded lazlanrafar as owner.");
  process.exit(0);
}
main();
