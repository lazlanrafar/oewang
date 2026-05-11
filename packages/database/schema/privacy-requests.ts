import { createId } from "@paralleldrive/cuid2";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const privacy_requests = pgTable("privacy_requests", {
  id: text("id").primaryKey().$defaultFn(createId),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  request_type: text("request_type").notNull(), // access | export | restrict | erasure
  status: text("status").notNull().default("received"), // received | in_progress | completed | rejected
  reason: text("reason"),
  payload: jsonb("payload"),
  result: jsonb("result"),
  note: text("note"),
  reviewed_by: text("reviewed_by").references(() => users.id),
  reviewed_at: timestamp("reviewed_at"),
  due_at: timestamp("due_at"),
  completed_at: timestamp("completed_at"),
  closed_reason: text("closed_reason"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  deleted_at: timestamp("deleted_at"),
});

export type PrivacyRequest = typeof privacy_requests.$inferSelect;
export type InsertPrivacyRequest = typeof privacy_requests.$inferInsert;
