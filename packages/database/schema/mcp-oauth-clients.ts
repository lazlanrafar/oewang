import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const mcp_oauth_clients = pgTable("mcp_oauth_clients", {
  id: text("id").primaryKey().$defaultFn(createId),
  client_id: text("client_id").notNull().unique(),
  client_name: text("client_name").notNull(),
  redirect_uris: text("redirect_uris").array().notNull().default([]),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export type McpOAuthClient = typeof mcp_oauth_clients.$inferSelect;
export type NewMcpOAuthClient = typeof mcp_oauth_clients.$inferInsert;
