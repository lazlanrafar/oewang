import { createId } from "@paralleldrive/cuid2";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const mcp_tokens = pgTable("mcp_tokens", {
  id: text("id").primaryKey().$defaultFn(createId),
  token: text("token").notNull().unique(),
  refresh_token: text("refresh_token").unique(),
  client_id: text("client_id").notNull(),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspace_id: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  revoked: boolean("revoked").default(false).notNull(),
  expires_at: timestamp("expires_at").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export type McpToken = typeof mcp_tokens.$inferSelect;
export type NewMcpToken = typeof mcp_tokens.$inferInsert;
