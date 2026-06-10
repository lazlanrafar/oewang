/**
 * Run once after db:push to enable pgvector and create the HNSW index.
 * Usage: bun run packages/database/setup-vector.ts
 */
import { db } from "./client";
import { sql } from "drizzle-orm";

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
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to setup vector:", err);
    process.exit(1);
  });
