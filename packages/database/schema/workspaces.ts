import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp, integer, bigint } from "drizzle-orm/pg-core";
import { pricing } from "./pricing";

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  country: text("country"),
  plan_id: text("plan_id").references(() => pricing.id),
  plan_status: text("plan_status").default("free").notNull(),
  plan_billing_interval: text("plan_billing_interval").$type<"monthly" | "annual">(),
  mayar_customer_email: text("mayar_customer_email"),
  mayar_transaction_id: text("mayar_transaction_id").unique(),
  plan_started_at: timestamp("plan_started_at"),
  plan_current_period_end: timestamp("plan_current_period_end"),
  plan_overdue_started_at: timestamp("plan_overdue_started_at"),
  plan_last_reminder_at: timestamp("plan_last_reminder_at"),
  ai_tokens_used: integer("ai_tokens_used").default(0).notNull(),
  ai_tokens_reset_at: timestamp("ai_tokens_reset_at").defaultNow().notNull(),
  vault_size_used_bytes: bigint("vault_size_used_bytes", { mode: "number" })
    .default(0)
    .notNull(),
  extra_ai_tokens: integer("extra_ai_tokens").default(0).notNull(),
  extra_vault_size_mb: integer("extra_vault_size_mb").default(0).notNull(),
  storage_violation_at: timestamp("storage_violation_at"),
  deleted_at: timestamp("deleted_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});
