import { createId } from "@paralleldrive/cuid2";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const mcp_auth_codes = pgTable("mcp_auth_codes", {
  id: text("id").primaryKey().$defaultFn(createId),
  code: text("code").notNull().unique(),
  client_id: text("client_id").notNull(),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspace_id: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  redirect_uri: text("redirect_uri").notNull(),
  code_challenge: text("code_challenge"),
  used: boolean("used").default(false).notNull(),
  expires_at: timestamp("expires_at").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export type McpAuthCode = typeof mcp_auth_codes.$inferSelect;
export type NewMcpAuthCode = typeof mcp_auth_codes.$inferInsert;
