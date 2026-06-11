import { createId } from "@paralleldrive/cuid2";
import {
  bigint,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { orders } from "./orders";
import { pricing } from "./pricing";
import { workspaces } from "./workspaces";

/**
 * Internal billing invoice record — one row per paid `orders` event.
 *
 * Separate from the user-facing `invoices` table (which workspaces send to their
 * own customers). These are OUR invoices to the workspace owner, generated from
 * Mayar payment webhooks. Stored locally so we can render a PDF or detail page
 * without round-tripping to Mayar's portal.
 */
export const billingInvoices = pgTable("billing_invoices", {
  id: text("id").$defaultFn(createId).primaryKey(),
  workspaceId: text("workspace_id")
    .references(() => workspaces.id)
    .notNull(),
  orderId: text("order_id").references(() => orders.id),
  /** Sequential per-workspace invoice number, e.g. "INV-2026-0001". */
  invoiceNumber: text("invoice_number").notNull(),
  /** Plan that was paid for (subscription invoices). */
  planId: text("plan_id").references(() => pricing.id),
  /** "monthly" | "annual" — for subscription invoices. */
  billingInterval: text("billing_interval").$type<"monthly" | "annual">(),
  /** Period the invoice covers (subscription only). */
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  /**
   * "subscription" | "addon" | "one_time" — drives how the invoice renders
   * (Mayar transaction id always present, but kind tells us what to show).
   */
  kind: text("kind").notNull(),
  /** Line items snapshotted at issue time (immutable). */
  lineItems: jsonb("line_items")
    .$type<
      Array<{
        description: string;
        quantity: number;
        unit_amount: number;
        amount: number;
        meta?: Record<string, unknown>;
      }>
    >()
    .notNull(),
  subtotal: bigint("subtotal", { mode: "number" }).notNull(),
  taxAmount: bigint("tax_amount", { mode: "number" }).default(0).notNull(),
  total: bigint("total", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  /** Snapshot of the billing email at issue time. */
  billingEmail: text("billing_email"),
  /** Snapshot of the workspace name. */
  workspaceName: text("workspace_name"),
  /** Mayar transaction id (so we can deep-link to their portal too). */
  mayarTransactionId: text("mayar_transaction_id"),
  /** Pre-paid invoices: when payment hit our account. */
  paidAt: timestamp("paid_at"),
  /** Sequence used to generate the invoice number — for atomic numbering. */
  sequence: integer("sequence").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});
