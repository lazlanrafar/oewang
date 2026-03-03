import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  serial,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { users } from "./users";

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  sequence_number: serial("sequence_number").notNull(),
  workspace_id: uuid("workspace_id").references(() => workspaces.id),
  user_id: uuid("user_id").references(() => users.id),
  stripe_payment_intent_id: text("stripe_payment_intent_id"),
  stripe_invoice_id: text("stripe_invoice_id"),
  stripe_subscription_id: text("stripe_subscription_id"),
  amount: integer("amount").notNull(), // in cents
  currency: text("currency").notNull(),
  status: text("status").notNull(), // 'pending', 'paid', 'failed', 'canceled'
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});
