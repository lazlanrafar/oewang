import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const device_tokens = pgTable("device_tokens", {
  id: text("id").primaryKey().$defaultFn(createId),
  user_id: text("user_id")
    .references(() => users.id)
    .notNull(),
  workspace_id: text("workspace_id")
    .references(() => workspaces.id)
    .notNull(),
  token: text("token").notNull().unique(),
  // 'ios' | 'android'
  platform: text("platform").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  // Soft delete (project rule: workspace-scoped rows are never hard-deleted).
  // Re-registering the same token revives the row via upsert (see repository).
  deleted_at: timestamp("deleted_at"),
});

export type DeviceToken = typeof device_tokens.$inferSelect;
export type InsertDeviceToken = typeof device_tokens.$inferInsert;
