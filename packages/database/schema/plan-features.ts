import { createId } from "@paralleldrive/cuid2";
import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const featureTypeEnum = pgEnum("feature_type", [
  "boolean",
  "numeric_limit",
]);

export const plan_features = pgTable("plan_features", {
  id: text("id").primaryKey().$defaultFn(createId),
  code: text("code").notNull().unique(), // e.g. "max_workspaces", "max_ai_tokens", "vault_storage", "export_pdf"
  name: text("name").notNull(),
  description: text("description"),
  type: featureTypeEnum("type").default("boolean").notNull(), // "boolean" | "numeric_limit"
  unit: text("unit"), // e.g. "MB", "Tokens", "Workspaces"
  default_value: text("default_value"), // Default limit or "true"/"false"
  is_active: boolean("is_active").default(true).notNull(),
  deleted_at: timestamp("deleted_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type PlanFeature = typeof plan_features.$inferSelect;
export type InsertPlanFeature = typeof plan_features.$inferInsert;
