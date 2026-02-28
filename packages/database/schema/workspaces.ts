import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  bigint,
} from "drizzle-orm/pg-core";
import { pricing } from "./pricing";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  country: text("country"),
  stripe_customer_id: text("stripe_customer_id").unique(),
  stripe_subscription_id: text("stripe_subscription_id").unique(),
  plan_id: uuid("plan_id").references(() => pricing.id),
  plan_status: text("plan_status").default("free").notNull(),
  stripe_current_period_end: timestamp("stripe_current_period_end"),
  ai_tokens_used: integer("ai_tokens_used").default(0).notNull(),
  vault_size_used_bytes: bigint("vault_size_used_bytes", { mode: "number" })
    .default(0)
    .notNull(),
  deleted_at: timestamp("deleted_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});
