import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { pricing } from "../packages/database/schema/pricing";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    return;
  }

  const client = postgres(url, { prepare: false });
  const db = drizzle(client);

  console.log("--- PRICING TABLE CONTENT ---");
  const rows = await db.select().from(pricing);

  const formatted = (rows as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    is_addon: r.is_addon,
    is_active: r.is_active,
    deleted_at: r.deleted_at,
    prices: JSON.stringify(r.prices),
  }));

  console.table(formatted);

  await client.end();
}

main().catch(console.error);
