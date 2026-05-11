import { createId } from "@paralleldrive/cuid2";
import { decimal, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { categories } from "./categories";

export const budgets = pgTable("budgets", {
  id: text("id").primaryKey().$defaultFn(createId),
  workspaceId: text("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  categoryId: text("category_id")
    .references(() => categories.id, { onDelete: "cascade" })
    .notNull(),
  amount: decimal("amount", { precision: 19, scale: 4 }).notNull(),
  period: text("period").default("monthly").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (table) => {
  return [
    index("budgets_workspace_id_idx").on(table.workspaceId),
    index("budgets_category_id_idx").on(table.categoryId),
  ];
});
