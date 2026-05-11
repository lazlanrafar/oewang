import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp, bigint, jsonb } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const vaultFiles = pgTable("vault_files", {
  id: text("id").$defaultFn(createId).primaryKey(),
  workspaceId: text("workspace_id")
    .references(() => workspaces.id)
    .notNull(),
  name: text("name").notNull(),
  key: text("key").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  type: text("type").notNull(),
  tags: jsonb("tags").$type<string[]>().default([]).notNull(),
  metadata: text("metadata"), // JSON string
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  inactive_at: timestamp("inactive_at"),
  deletedAt: timestamp("deleted_at"),
});
