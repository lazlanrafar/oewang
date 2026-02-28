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
  currency: text("currency").default("usd").notNull(),
  features: jsonb("features").$type<string[]>().default([]).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  deleted_at: timestamp("deleted_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});
