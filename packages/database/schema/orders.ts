import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sequence_number: serial("sequence_number").notNull(),
    workspace_id: uuid("workspace_id").references(() => workspaces.id),
    user_id: uuid("user_id").references(() => users.id),
    xendit_payment_id: text("xendit_payment_id"),
    xendit_invoice_id: text("xendit_invoice_id"),
    xendit_subscription_id: text("xendit_subscription_id"),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    manual: boolean("manual").default(false).notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
    deleted_at: timestamp("deleted_at"),
  },
  (table) => [
    uniqueIndex("orders_xendit_invoice_id_unique").on(table.xendit_invoice_id),
  ],
);
