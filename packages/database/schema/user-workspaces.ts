import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const user_workspaces = pgTable(
  "user_workspaces",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    workspace_id: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'owner' | 'admin' | 'member'
    joined_at: timestamp("joined_at").defaultNow().notNull(),
    deleted_at: timestamp("deleted_at"),
  },
  (table) => ({
    workspaceUserIdx: uniqueIndex("workspace_user_idx").on(
      table.workspace_id,
      table.user_id,
    ),
  }),
);
