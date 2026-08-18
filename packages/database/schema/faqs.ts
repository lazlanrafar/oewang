import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Global marketing FAQ managed from the admin panel — feeds the public website
// FAQ section. Ordered by `sort_order` (ascending) when shown publicly.
export const faqs = pgTable(
  "faqs",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    category: text("category"),
    sort_order: integer("sort_order").default(0).notNull(),
    published: boolean("published").default(true).notNull(),
    deleted_at: timestamp("deleted_at"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // Public list: published FAQs in display order, excluding soft-deleted.
    index("faqs_published_idx")
      .on(t.published, t.sort_order)
      .where(sql`${t.deleted_at} IS NULL`),
  ],
);
