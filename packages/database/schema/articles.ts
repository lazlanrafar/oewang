import { createId } from "@paralleldrive/cuid2";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const articles = pgTable("articles", {
  id: text("id").primaryKey().$defaultFn(createId),
  title: text("title").notNull(),
  content: text("content"),
  published: boolean("published").default(false),
  author_id: text("author_id").references(() => users.id),
  workspace_id: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  deleted_at: timestamp("deleted_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});
