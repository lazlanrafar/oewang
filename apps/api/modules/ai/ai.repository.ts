import {
  db,
  eq,
  and,
  isNull,
  desc,
  sql,
  wallets,
  transactions,
  categories,
} from "@workspace/database";

export abstract class AiRepository {
  /**
   * Get recent transactions with wallet & category name.
   */
  static async getRecentTransactions(workspaceId: string, limit = 20) {
    const result = await db
      .select({
        id: transactions.id,
        name: transactions.name,
        amount: transactions.amount,
        type: transactions.type,
        date: transactions.date,
        description: transactions.description,
        walletName: wallets.name,
        categoryName: categories.name,
      })
      .from(transactions)
      .leftJoin(wallets, eq(transactions.walletId, wallets.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          eq(transactions.workspaceId, workspaceId),
          isNull(transactions.deletedAt),
        ),
      )
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(limit);

    return result;
  }

  /**
   * Get all wallets with their current balances.
   */
  static async getWalletSummary(workspaceId: string) {
    const result = await db
      .select({
        id: wallets.id,
        name: wallets.name,
        balance: wallets.balance,
        isIncludedInTotals: wallets.isIncludedInTotals,
      })
      .from(wallets)
      .where(
        and(eq(wallets.workspaceId, workspaceId), isNull(wallets.deletedAt)),
      );

    return result.map((w) => ({
      ...w,
      balance: Number(w.balance),
    }));
  }

  /**
   * Get spending by category for the last N days.
   */
  static async getSpendingByCategory(workspaceId: string, days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const result = await db
      .select({
        categoryName: categories.name,
        total: sql<number>`SUM(CAST(${transactions.amount} AS DECIMAL))`,
        count: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          eq(transactions.workspaceId, workspaceId),
          eq(transactions.type, "expense"),
          isNull(transactions.deletedAt),
          sql`${transactions.date} >= ${cutoffStr}`,
        ),
      )
      .groupBy(categories.name)
      .orderBy(sql`SUM(CAST(${transactions.amount} AS DECIMAL)) DESC`);

    return result;
  }

  /**
   * Get monthly income vs expense totals for the last N months.
   */
  static async getMonthlyTotals(workspaceId: string, months = 3) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const result = await db
      .select({
        month: sql<string>`TO_CHAR(${transactions.date}::date, 'YYYY-MM')`,
        type: transactions.type,
        total: sql<number>`SUM(CAST(${transactions.amount} AS DECIMAL))`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.workspaceId, workspaceId),
          isNull(transactions.deletedAt),
          sql`${transactions.date} >= ${cutoffStr}`,
        ),
      )
      .groupBy(
        sql`TO_CHAR(${transactions.date}::date, 'YYYY-MM')`,
        transactions.type,
      )
      .orderBy(sql`TO_CHAR(${transactions.date}::date, 'YYYY-MM') DESC`);

    return result;
  }
}
