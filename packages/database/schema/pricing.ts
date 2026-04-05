import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const pricing = pgTable("pricing", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  prices: jsonb("prices")
    .$type<
      {
        currency: string;
        monthly: number;
        yearly: number;
        xendit_monthly_id?: string;
        xendit_yearly_id?: string;
        xendit_product_id?: string;
      }[]
    >()
    .default([])
    .notNull(),
  xendit_product_id: text("xendit_product_id"),
  max_vault_size_mb: integer("max_vault_size_mb").default(100).notNull(),
  max_ai_tokens: integer("max_ai_tokens").default(100).notNull(),
  max_workspaces: integer("max_workspaces").default(1).notNull(),
  features: jsonb("features").$type<string[]>().default([]).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  is_addon: boolean("is_addon").default(false).notNull(),
  addon_type: text("addon_type").$type<"ai" | "vault">(),
  deleted_at: timestamp("deleted_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});
