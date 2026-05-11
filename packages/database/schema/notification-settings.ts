import { createId } from "@paralleldrive/cuid2";
import { pgTable, boolean, timestamp, text } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const notification_settings = pgTable("notification_settings", {
  id: text("id").primaryKey().$defaultFn(createId),
  user_id: text("user_id")
    .references(() => users.id)
    .notNull(),
  workspace_id: text("workspace_id")
    .references(() => workspaces.id)
    .notNull(),
  email_enabled: boolean("email_enabled").default(true).notNull(),
  whatsapp_enabled: boolean("whatsapp_enabled").default(true).notNull(),
  push_enabled: boolean("push_enabled").default(true).notNull(),
  marketing_enabled: boolean("marketing_enabled").default(false).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  deleted_at: timestamp("deleted_at"),
});

export type NotificationSetting = typeof notification_settings.$inferSelect;
export type InsertNotificationSetting =
  typeof notification_settings.$inferInsert;
