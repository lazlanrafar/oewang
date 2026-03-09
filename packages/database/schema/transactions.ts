import {
  pgTable,
  text,
  timestamp,
  uuid,
  decimal,
  boolean,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { wallets } from "./wallets";
import { categories } from "./categories";
import { users } from "./users";

export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  walletId: uuid("wallet_id")
    .notNull()
    .references(() => wallets.id, { onDelete: "cascade" }),
  toWalletId: uuid("to_wallet_id").references(() => wallets.id, {
    onDelete: "set null",
  }),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  assignedUserId: uuid("assigned_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  amount: decimal("amount", { precision: 19, scale: 4 }).notNull(),
  date: timestamp("date", { mode: "string" }).notNull(),
  type: text("type").notNull(), // 'income' | 'expense' | 'transfer'
  description: text("description"),
  name: text("name"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  isReady: boolean("is_ready").default(false).notNull(),
  isExported: boolean("is_exported").default(false).notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});
