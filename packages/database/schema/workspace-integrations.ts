import { createId } from "@paralleldrive/cuid2";
import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const workspaceIntegrations = pgTable("workspace_integrations", {
  id: text("id").$defaultFn(createId).primaryKey().notNull(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  settings: jsonb("settings"),
  isActive: boolean("is_active").default(false).notNull(),
  connectedAt: timestamp("connected_at", { mode: "string" }),
  connectedBy: text("connected_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
}, (t) => [
  uniqueIndex("workspace_integrations_workspace_provider_idx").on(t.workspaceId, t.provider),
]);

export type WorkspaceIntegration = typeof workspaceIntegrations.$inferSelect;
export type NewWorkspaceIntegration = typeof workspaceIntegrations.$inferInsert;
