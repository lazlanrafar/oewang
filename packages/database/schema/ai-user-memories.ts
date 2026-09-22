import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const aiUserMemories = pgTable(
  "ai_user_memories",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id),
    workspace_id: text("workspace_id").references(() => workspaces.id),
    scope_key: text("scope_key").notNull(),
    kind: text("kind").notNull(),
    memory_key: text("memory_key").notNull(),
    value: text("value").notNull(),
    source: text("source").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
    deleted_at: timestamp("deleted_at"),
  },
  (t) => [
    uniqueIndex("ai_user_memories_live_key")
      .on(t.user_id, t.scope_key, t.kind, t.memory_key)
      .where(sql`${t.deleted_at} IS NULL`),
    index("ai_user_memories_user_scope_idx")
      .on(t.user_id, t.workspace_id)
      .where(sql`${t.deleted_at} IS NULL`),
    check(
      "ai_user_memories_scope_check",
      sql`(${t.workspace_id} IS NULL AND ${t.scope_key} = 'global' AND ${t.kind} IN ('language', 'style')) OR (${t.workspace_id} IS NOT NULL AND ${t.scope_key} = ${t.workspace_id} AND ${t.kind} IN ('wallet', 'category', 'fact'))`,
    ),
  ],
);
