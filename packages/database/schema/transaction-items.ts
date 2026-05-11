import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp, decimal, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { transactions } from "./transactions";
import { categories } from "./categories";

export const transactionItems = pgTable(
  "transaction_items",
  {
    id: text("id").$defaultFn(createId).primaryKey().notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    brand: text("brand"),
    quantity: decimal("quantity", { precision: 10, scale: 3 }),
    unit: text("unit"),
    unitPrice: decimal("unit_price", { precision: 19, scale: 4 }),
    amount: decimal("amount", { precision: 19, scale: 4 }).notNull(),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string" }),
  },
  (table) => [
    index("transaction_items_workspace_id_idx").on(table.workspaceId),
    index("transaction_items_transaction_id_idx").on(table.transactionId),
  ],
);

export type TransactionItem = typeof transactionItems.$inferSelect;
export type NewTransactionItem = typeof transactionItems.$inferInsert;
