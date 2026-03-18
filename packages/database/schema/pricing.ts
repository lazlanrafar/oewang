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
        stripe_monthly_id?: string;
        stripe_yearly_id?: string;
      }[]
    >()
    .default([])
    .notNull(),
  stripe_product_id: text("stripe_product_id"),
  max_vault_size_mb: integer("max_vault_size_mb").default(100).notNull(),
  max_ai_tokens: integer("max_ai_tokens").default(100).notNull(),
  features: jsonb("features").$type<string[]>().default([]).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  deleted_at: timestamp("deleted_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});
