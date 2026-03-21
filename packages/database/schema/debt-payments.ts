import { pgTable, text, timestamp, uuid, decimal } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { debts } from "./debts";
import { transactions } from "./transactions";

export const debtPayments = pgTable("debt_payments", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  debtId: uuid("debt_id")
    .notNull()
    .references(() => debts.id, { onDelete: "cascade" }),
  transactionId: uuid("transaction_id")
    .references(() => transactions.id, { onDelete: "set null" }),
  amount: decimal("amount", { precision: 19, scale: 4 }).notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});

export type DebtPayment = typeof debtPayments.$inferSelect;
export type NewDebtPayment = typeof debtPayments.$inferInsert;
