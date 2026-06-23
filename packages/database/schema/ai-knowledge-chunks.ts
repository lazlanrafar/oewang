import { createId } from "@paralleldrive/cuid2";
import { integer, pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";

// Global (not workspace-scoped) knowledge base for the RAG advisor.
// Populated by apps/ai/scripts/seed_knowledge.py from the markdown docs.
export const aiKnowledgeChunks = pgTable("ai_knowledge_chunks", {
  id: text("id").primaryKey().$defaultFn(createId),
  source: text("source").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  chunk_index: integer("chunk_index").notNull().default(0),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export type AiKnowledgeChunk = typeof aiKnowledgeChunks.$inferSelect;
export type InsertAiKnowledgeChunk = typeof aiKnowledgeChunks.$inferInsert;
