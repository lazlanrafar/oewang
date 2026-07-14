import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { aiSessions } from "./ai-sessions";

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    session_id: text("session_id")
      .references(() => aiSessions.id, { onDelete: "cascade" })
      .notNull(),
    workspace_id: text("workspace_id").notNull(),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    content: text("content").notNull(),
    attachments: jsonb("attachments"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    deleted_at: timestamp("deleted_at"),
  },
  (t) => [
    // Chat history load: filter by session, order by created_at.
    index("ai_messages_session_created_idx")
      .on(t.session_id, t.created_at)
      .where(sql`${t.deleted_at} IS NULL`),
  ],
);

export type AiMessage = typeof aiMessages.$inferSelect;
export type InsertAiMessage = typeof aiMessages.$inferInsert;
