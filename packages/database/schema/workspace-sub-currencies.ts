import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const workspaceSubCurrencies = pgTable("workspace_sub_currencies", {
  id: text("id").$defaultFn(createId).primaryKey(),
  workspaceId: text("workspace_id")
    .references(() => workspaces.id)
    .notNull(),
  currencyCode: text("currency_code").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});
