import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import {
  boolean,
  decimal,
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { categories } from "./categories";
import { users } from "./users";
import { wallets } from "./wallets";
import { workspaces } from "./workspaces";

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").$defaultFn(createId).primaryKey().notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    toWalletId: text("to_wallet_id").references(() => wallets.id, {
      onDelete: "set null",
    }),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    assignedUserId: text("assigned_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    amount: decimal("amount", { precision: 19, scale: 4 }).notNull(),
    // Multicurrency: when set, `amount` is the main-currency value computed as
    // originalAmount * exchangeRate. When null, the transaction is in the main
    // currency and these fields can be ignored.
    originalAmount: decimal("original_amount", { precision: 19, scale: 4 }),
    originalCurrencyCode: text("original_currency_code"),
    exchangeRate: decimal("exchange_rate", { precision: 19, scale: 8 }),
    date: timestamp("date", { mode: "string" }).notNull(),
    type: text("type").notNull(), // 'income' | 'expense' | 'transfer'
    description: text("description"),
    name: text("name"),
    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    isReady: boolean("is_ready").default(false).notNull(),
    isExported: boolean("is_exported").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { mode: "string" }),
  },
  (t) => [
    // Covers every list/metrics query: workspace scope, live rows, date sort.
    index("transactions_workspace_date_idx")
      .on(t.workspaceId, t.date.desc(), t.createdAt.desc())
      .where(sql`${t.deletedAt} IS NULL`),
    index("transactions_wallet_id_idx").on(t.walletId),
    index("transactions_category_id_idx").on(t.categoryId),
  ],
);
