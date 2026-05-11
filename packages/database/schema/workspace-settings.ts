import { createId } from "@paralleldrive/cuid2";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const workspaceSettings = pgTable("workspace_settings", {
  id: text("id").$defaultFn(createId).primaryKey(),
  workspaceId: text("workspace_id")
    .references(() => workspaces.id)
    .notNull(),
  monthlyStartDate: integer("monthly_start_date").default(1).notNull(),
  monthlyStartDateWeekendHandling: text("monthly_start_date_weekend_handling")
    .default("no-changes")
    .notNull(),
  weeklyStartDay: text("weekly_start_day").default("Sunday").notNull(),
  carryOver: boolean("carry_over").default(false).notNull(),
  period: text("period").default("Monthly").notNull(),
  incomeExpensesColor: text("income_expenses_color").default("Exp.").notNull(),
  autocomplete: boolean("autocomplete").default(true).notNull(),
  timeInput: text("time_input").default("None").notNull(),
  startScreen: text("start_screen").default("Daily").notNull(),
  swipeAction: text("swipe_action").default("Change Date").notNull(),
  showDescription: boolean("show_description").default(false).notNull(),
  inputOrder: text("input_order").default("Amount").notNull(),
  noteButton: boolean("note_button").default(false).notNull(),
  mainCurrencyCode: text("main_currency_code").default("USD").notNull(),
  mainCurrencySymbol: text("main_currency_symbol").default("$").notNull(),
  mainCurrencySymbolPosition: text("main_currency_symbol_position")
    .default("Front")
    .notNull(),
  mainCurrencyDecimalPlaces: integer("main_currency_decimal_places")
    .default(2)
    .notNull(),
  r2Endpoint: text("r2_endpoint"),
  r2AccessKeyId: text("r2_access_key_id"),
  r2SecretAccessKey: text("r2_secret_access_key"),
  r2BucketName: text("r2_bucket_name"),
  invoiceLogoUrl: text("invoice_logo_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});
