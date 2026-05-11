import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp, decimal } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { debts } from "./debts";
import { transactions } from "./transactions";

export const debtPayments = pgTable("debt_payments", {
  id: text("id").$defaultFn(createId).primaryKey().notNull(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  debtId: text("debt_id")
    .notNull()
    .references(() => debts.id, { onDelete: "cascade" }),
  transactionId: text("transaction_id")
    .references(() => transactions.id, { onDelete: "set null" }),
  amount: decimal("amount", { precision: 19, scale: 4 }).notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});

export type DebtPayment = typeof debtPayments.$inferSelect;
export type NewDebtPayment = typeof debtPayments.$inferInsert;
