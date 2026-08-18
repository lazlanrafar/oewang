import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const aiSessions = pgTable(
  "ai_sessions",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    workspace_id: text("workspace_id")
      .references(() => workspaces.id)
      .notNull(),
    title: text("title").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
    deleted_at: timestamp("deleted_at"),
  },
  (t) => [
    index("ai_sessions_workspace_idx")
      .on(t.workspace_id, t.updated_at.desc())
      .where(sql`${t.deleted_at} IS NULL`),
  ],
);

export type AiSession = typeof aiSessions.$inferSelect;
export type InsertAiSession = typeof aiSessions.$inferInsert;
