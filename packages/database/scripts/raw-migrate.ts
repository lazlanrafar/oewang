import { sql } from "drizzle-orm";
import { db } from "../client";

async function run() {
  console.log("Applying sequence migration to orders table...");
  try {
    await db.execute(
      sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS sequence_number SERIAL NOT NULL;`,
    );
    console.log("Success!");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

run().catch(console.error);
