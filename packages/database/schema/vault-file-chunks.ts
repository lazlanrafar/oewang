import { createId } from "@paralleldrive/cuid2";
import {
  integer,
  pgTable,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";
import { vaultFiles } from "./vault-files";
import { workspaces } from "./workspaces";

export const vaultFileChunks = pgTable("vault_file_chunks", {
  id: text("id").primaryKey().$defaultFn(createId),
  vault_file_id: text("vault_file_id")
    .references(() => vaultFiles.id, { onDelete: "cascade" })
    .notNull(),
  workspace_id: text("workspace_id")
    .references(() => workspaces.id)
    .notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  chunk_index: integer("chunk_index").notNull().default(0),
  token_count: integer("token_count"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  deleted_at: timestamp("deleted_at"),
});

export type VaultFileChunk = typeof vaultFileChunks.$inferSelect;
export type InsertVaultFileChunk = typeof vaultFileChunks.$inferInsert;
