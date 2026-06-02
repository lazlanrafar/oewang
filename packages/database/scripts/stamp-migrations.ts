/**
 * stamp-migrations.ts
 *
 * Use this ONCE when a database was bootstrapped via `drizzle-kit push` (which does not
 * record migration history) and you now want to switch to `drizzle-kit migrate`.
 *
 * It reads the local _journal.json, creates the drizzle schema + __drizzle_migrations
 * table if needed, and inserts a row for every migration that isn't already recorded —
 * WITHOUT executing any SQL. This lets `drizzle-kit migrate` skip past already-applied
 * migrations on subsequent runs.
 *
 * Usage:
 *   bun --env-file=../../.env.production packages/database/scripts/stamp-migrations.ts
 *   # or for local:
 *   bun --env-file=../../.env packages/database/scripts/stamp-migrations.ts
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
import * as path from "path";
import { readFileSync, readdirSync } from "fs";
import { createHash } from "crypto";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}

const drizzleDir = path.resolve(__dirname, "../drizzle");
const journal = JSON.parse(
  readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf-8"),
) as { entries: { idx: number; tag: string; when: number }[] };

async function main() {
  const client = postgres(DATABASE_URL!, { prepare: false });

  // 1. Ensure the drizzle schema and migrations table exist
  await client`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await client`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id           SERIAL PRIMARY KEY,
      hash         TEXT    NOT NULL,
      created_at   BIGINT
    )
  `;

  // 2. Fetch already-recorded hashes
  const existing = await client`SELECT hash FROM drizzle.__drizzle_migrations`;
  const recordedHashes = new Set(existing.map((r) => r.hash));

  // 3. For each migration in the journal, compute its hash and stamp if missing
  let stamped = 0;
  for (const entry of journal.entries) {
    const sqlFile = path.join(drizzleDir, `${entry.tag}.sql`);
    let sqlContent: string;
    try {
      sqlContent = readFileSync(sqlFile, "utf-8");
    } catch {
      console.warn(`  ⚠  SQL file not found for ${entry.tag} — skipping`);
      continue;
    }

    // Drizzle uses sha256 of the SQL content as the hash
    const hash = createHash("sha256").update(sqlContent).digest("hex");

    if (recordedHashes.has(hash)) {
      console.log(`  ✓  Already recorded: ${entry.tag}`);
    } else {
      await client`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${entry.when})
      `;
      console.log(`  ↻  Stamped: ${entry.tag}`);
      stamped++;
    }
  }

  await client.end();
  console.log(
    `\n✅ Done. Stamped ${stamped} migration(s). You can now safely run \`drizzle-kit migrate\`.`,
  );
}

main().catch((err) => {
  console.error("❌ Stamp failed:", err);
  process.exit(1);
});
