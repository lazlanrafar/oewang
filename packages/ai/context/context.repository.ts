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
  debts,
  contacts,
  workspaceSettings,
} from "@workspace/database";

export abstract class ContextRepository {
  static async getWorkspaceSettings(workspaceId: string) {
    const results = await db
      .select({
        mainCurrencyCode: workspaceSettings.mainCurrencyCode,
        mainCurrencySymbol: workspaceSettings.mainCurrencySymbol,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
      .limit(1);
    
    return results[0];
  }

  static async getRecentTransactions(workspaceId: string, limit = 10) {
    return await db
      .select({
        id: transactions.id,
        name: transactions.name,
        amount: transactions.amount,
        type: transactions.type,
        date: transactions.date,
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
  }

  static async getOutstandingDebts(workspaceId: string) {
    return await db
      .select({
        id: debts.id,
        contactName: contacts.name,
        type: debts.type,
        remainingAmount: debts.remainingAmount,
        dueDate: debts.dueDate,
      })
      .from(debts)
      .leftJoin(contacts, eq(debts.contactId, contacts.id))
      .where(
        and(
          eq(debts.workspaceId, workspaceId),
          eq(debts.status, "unpaid"),
          isNull(debts.deletedAt),
        ),
      );
  }

  static async getWalletSummary(workspaceId: string) {
    return await db
      .select({
        name: wallets.name,
        balance: wallets.balance,
      })
      .from(wallets)
      .where(
        and(eq(wallets.workspaceId, workspaceId), isNull(wallets.deletedAt)),
      );
  }

  static async getSpendingByCategory(workspaceId: string, days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    return await db
      .select({
        categoryName: categories.name,
        total: sql<number>`SUM(CAST(${transactions.amount} AS DECIMAL))`,
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
  }
}
