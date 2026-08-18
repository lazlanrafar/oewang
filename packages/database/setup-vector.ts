/**
 * Run once after db:push to create indexes Drizzle can't express in schema:
 *   - pgvector extension + HNSW indexes for RAG similarity search
 *   - pg_trgm extension + GIN index for ILIKE '%..%' contact search
 *   - GIN index for JSONB containment (@>) on pricing.prices
 * Usage: bun run packages/database/setup-vector.ts
 */

import { sql } from "drizzle-orm";
import { db } from "./client";

async function main() {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  console.log("✓ pgvector extension enabled");

  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS vault_file_chunks_embedding_idx
        ON vault_file_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)`,
  );
  console.log("✓ HNSW index created on vault_file_chunks.embedding");

  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_embedding_idx
        ON ai_knowledge_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)`,
  );
  console.log("✓ HNSW index created on ai_knowledge_chunks.embedding");

  // Trigram search: contacts.name is queried with ILIKE '%..%' by both the
  // contacts and debts list endpoints. A GIN trgm index turns that from a
  // sequential scan into an index scan.
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  console.log("✓ pg_trgm extension enabled");

  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS contacts_name_trgm_idx
        ON contacts
        USING gin (name gin_trgm_ops)`,
  );
  console.log("✓ trigram index created on contacts.name");

  // JSONB containment: the Mayar webhook resolves a plan via prices @> '[...]'
  // on every relevant event; a GIN index on the jsonb column serves it.
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS pricing_prices_gin_idx
        ON pricing
        USING gin (prices)`,
  );
  console.log("✓ GIN index created on pricing.prices");

  // Refresh planner statistics so the newly created indexes are costed
  // correctly (CREATE INDEX does not run ANALYZE).
  await db.execute(sql`ANALYZE`);
  console.log("✓ ANALYZE complete (planner stats refreshed)");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to setup vector:", err);
    process.exit(1);
  });
