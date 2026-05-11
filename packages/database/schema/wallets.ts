import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp, integer, decimal, boolean, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { workspaces } from "./workspaces";
import { walletGroups } from "./wallet-groups";

export const wallets = pgTable("wallets", {
  id: text("id").$defaultFn(createId).primaryKey().notNull(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  groupId: text("group_id").references(() => walletGroups.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  balance: decimal("balance", { precision: 19, scale: 4 })
    .default("0")
    .notNull(),
  isIncludedInTotals: boolean("is_included_in_totals").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});
