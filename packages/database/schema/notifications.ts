import { createId } from "@paralleldrive/cuid2";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey().$defaultFn(createId),
  user_id: text("user_id")
    .references(() => users.id)
    .notNull(),
  workspace_id: text("workspace_id")
    .references(() => workspaces.id)
    .notNull(),
  type: text("type").notNull(), // e.g., 'transaction.created', 'subscription.expiring'
  title: text("title").notNull(),
  message: text("message").notNull(),
  is_read: boolean("is_read").default(false).notNull(),
  link: text("link"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  deleted_at: timestamp("deleted_at"),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
