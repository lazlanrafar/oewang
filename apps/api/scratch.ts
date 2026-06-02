import { db, notifications } from "@workspace/database";

async function main() {
  const result = await db.select().from(notifications);
  console.log("Notifications count:", result.length);
  console.log(result.slice(0, 3));
}
main()
  .catch(console.error)
  .then(() => process.exit(0));
