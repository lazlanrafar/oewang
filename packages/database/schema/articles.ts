import { createId } from "@paralleldrive/cuid2";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

// Global marketing content (blog / help center) managed from the admin panel —
// not workspace-scoped. `content` holds the Tiptap HTML string; `slug` is the
// public URL segment (unique across published + drafts).
export const articles = pgTable("articles", {
  id: text("id").primaryKey().$defaultFn(createId),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content"),
  cover_image: text("cover_image"),
  published: boolean("published").default(false).notNull(),
  published_at: timestamp("published_at"),
  author_id: text("author_id").references(() => users.id),
  deleted_at: timestamp("deleted_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});
