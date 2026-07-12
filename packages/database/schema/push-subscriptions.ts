import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const push_subscriptions = pgTable("push_subscriptions", {
  id: text("id").primaryKey().$defaultFn(createId),
  user_id: text("user_id")
    .references(() => users.id)
    .notNull(),
  workspace_id: text("workspace_id")
    .references(() => workspaces.id)
    .notNull(),
  endpoint: text("endpoint").notNull().unique(),
  // JSON string of the full PushSubscription object
  subscription: text("subscription").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  // Soft delete (project rule: workspace-scoped rows are never hard-deleted).
  // Re-subscribing the same endpoint revives the row via upsert (see repository).
  deleted_at: timestamp("deleted_at"),
});

export type PushSubscription = typeof push_subscriptions.$inferSelect;
export type InsertPushSubscription = typeof push_subscriptions.$inferInsert;
