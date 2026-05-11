import { createId } from "@paralleldrive/cuid2";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { aiSessions } from "./ai-sessions";

export const aiMessages = pgTable("ai_messages", {
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
});

export type AiMessage = typeof aiMessages.$inferSelect;
export type InsertAiMessage = typeof aiMessages.$inferInsert;
