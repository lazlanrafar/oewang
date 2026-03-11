import {
  pgTable,
  text,
  timestamp,
  uuid,
  decimal,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { customers } from "./customers";

export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "restrict" }),
  invoiceNumber: text("invoice_number").notNull(),
  status: text("status").notNull().default("draft"), // 'draft', 'unpaid', 'paid', 'overdue', 'canceled'

  issueDate: timestamp("issue_date", { mode: "string" }),
  dueDate: timestamp("due_date", { mode: "string" }),

  amount: decimal("amount", { precision: 19, scale: 4 }).notNull().default("0"),
  vat: decimal("vat", { precision: 19, scale: 4 }).default("0"),
  tax: decimal("tax", { precision: 19, scale: 4 }).default("0"),
  currency: text("currency").notNull().default("USD"),

  internalNote: text("internal_note"),
  noteDetails: text("note_details"),
  paymentDetails: text("payment_details"),
  logoUrl: text("logo_url"),

  lineItems: jsonb("line_items").notNull().default([]), // Array of { name: string, quantity: number, price: number }
  invoiceSize: text("invoice_size").notNull().default("A4"),
  dateFormat: text("date_format").notNull().default("DD/MM/YYYY"),
  paymentTerms: text("payment_terms").notNull().default("Due on Receipt"),
  templateName: text("template_name").notNull().default("Default"),
  invoiceSettings: jsonb("invoice_settings").notNull().default({
    salesTax: false,
    vat: false,
    lineItemTax: false,
    discount: false,
    decimals: false,
    units: false,
    qrCode: true,
  }),

  isPublic: boolean("is_public").notNull().default(false),
  accessCode: text("access_code"), 
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
