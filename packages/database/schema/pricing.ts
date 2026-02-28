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
  price_monthly: integer("price_monthly"), // stored in cents
  price_yearly: integer("price_yearly"), // stored in cents
  price_one_time: integer("price_one_time"), // stored in cents
  stripe_product_id: text("stripe_product_id"),
  stripe_price_id_monthly: text("stripe_price_id_monthly"),
  stripe_price_id_yearly: text("stripe_price_id_yearly"),
  stripe_price_id_one_time: text("stripe_price_id_one_time"),
  max_vault_size_mb: integer("max_vault_size_mb").default(100).notNull(),
  max_ai_tokens: integer("max_ai_tokens").default(100).notNull(),
  currency: text("currency").default("usd").notNull(),
  features: jsonb("features").$type<string[]>().default([]).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  deleted_at: timestamp("deleted_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});
