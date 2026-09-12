import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

// Bug reports / feature requests submitted from the marketing website
// (anonymous — name/email) or the native app (logged in — user_id). Reviewed
// and status-transitioned by admins from apps/admin.
export const feedback = pgTable(
  "feedback",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    user_id: text("user_id").references(() => users.id),
    name: text("name"),
    email: text("email"),
    source: text("source", { enum: ["website", "native"] }).notNull(),
    type: text("type", {
      enum: ["bug", "feature_request", "other"],
    }).notNull(),
    message: text("message").notNull(),
    screenshot_url: text("screenshot_url"),
    status: text("status", {
      enum: ["new", "in_review", "planned", "resolved", "rejected"],
    })
      .default("new")
      .notNull(),
    admin_note: text("admin_note"),
    resolved_at: timestamp("resolved_at"),
    reviewed_by: text("reviewed_by").references(() => users.id),
    deleted_at: timestamp("deleted_at"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // Admin list: newest first per status, excluding soft-deleted.
    index("feedback_status_created_idx")
      .on(t.status, t.created_at.desc())
      .where(sql`${t.deleted_at} IS NULL`),
  ],
);

export type Feedback = typeof feedback.$inferSelect;
export type InsertFeedback = typeof feedback.$inferInsert;
