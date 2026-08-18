import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const walletGroups = pgTable(
  "wallet_groups",
  {
    id: text("id").$defaultFn(createId).primaryKey().notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string" }),
  },
  (t) => [
    index("wallet_groups_workspace_idx")
      .on(t.workspaceId)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);
