import { db, contacts } from "./packages/database";

async function test() {
  try {
    console.log("Querying contacts...");
    const results = await db.select().from(contacts).limit(1);
    console.log("Success:", results);
  } catch (err) {
    console.error("Failed to query contacts:", err);
  } finally {
    process.exit(0);
  }
}

test();
