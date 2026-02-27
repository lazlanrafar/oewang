import { db } from "./client.ts";
import { users } from "./schema/users.ts";
import { eq } from "drizzle-orm";

async function main() {
  const account = await db.select().from(users).where(eq(users.email, "lazlanrafar@gmail.com"));
  console.log("Account Role:", account[0]?.system_role);
  process.exit(0);
}
main();
