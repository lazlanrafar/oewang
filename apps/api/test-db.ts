import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function run() {
  try {
    await client`
      insert into "audit_logs" ("workspace_id", "user_id", "action", "entity", "entity_id", "before", "after") 
      values (
        '08085f39-3825-4b10-bec5-a134ae11267b',
        '4c3a2f8b-0edb-4d4b-ba85-48b4d8d1eacc',
        'ai.receipt_parsed',
        'vault_file',
        '00000000-0000-0000-0000-000000000000',
        null,
        '{"test":"true"}'::jsonb
      )
    `;
    console.log("Success");
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();
