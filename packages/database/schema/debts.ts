import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp, decimal, pgEnum } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { transactions } from "./transactions";
import { contacts } from "./contacts";

export const debtTypeEnum = pgEnum("debt_type", ["payable", "receivable"]);
export const debtOriginEnum = pgEnum("debt_origin", ["manual", "from_transaction"]);
export const debtStatusEnum = pgEnum("debt_status", ["unpaid", "partial", "paid"]);

export const debts = pgTable("debts", {
  id: text("id").$defaultFn(createId).primaryKey().notNull(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  sourceTransactionId: text("source_transaction_id")
    .references(() => transactions.id, { onDelete: "set null" }),
  type: debtTypeEnum("type").notNull(),
  origin: debtOriginEnum("origin").default("manual").notNull(),
  amount: decimal("amount", { precision: 19, scale: 4 }).notNull(),
  remainingAmount: decimal("remaining_amount", { precision: 19, scale: 4 }).notNull(),
  status: debtStatusEnum("status").default("unpaid").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});

export type Debt = typeof debts.$inferSelect;
export type NewDebt = typeof debts.$inferInsert;
