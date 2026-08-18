import { createId } from "@paralleldrive/cuid2";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Global marketing FAQ managed from the admin panel — feeds the public website
// FAQ section. Ordered by `sort_order` (ascending) when shown publicly.
export const faqs = pgTable("faqs", {
  id: text("id").primaryKey().$defaultFn(createId),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category"),
  sort_order: integer("sort_order").default(0).notNull(),
  published: boolean("published").default(true).notNull(),
  deleted_at: timestamp("deleted_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});
