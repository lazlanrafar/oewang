import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    sequence_number: serial("sequence_number").notNull(),
    workspace_id: text("workspace_id").references(() => workspaces.id),
    user_id: text("user_id").references(() => users.id),
    mayar_payment_id: text("mayar_payment_id"),
    mayar_invoice_id: text("mayar_invoice_id"),
    mayar_transaction_id: text("mayar_transaction_id"),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    manual: boolean("manual").default(false).notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
    deleted_at: timestamp("deleted_at"),
  },
  (table) => [
    uniqueIndex("orders_mayar_invoice_id_unique").on(table.mayar_invoice_id),
  ],
);
