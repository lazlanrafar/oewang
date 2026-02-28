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
  aiSessions,
  aiMessages,
  pricing,
  workspaces,
} from "@workspace/database";

export abstract class AiRepository {
  /**
   * Create a new AI chat session.
   */
  static async createSession(workspaceId: string, title: string) {
    const [session] = await db
      .insert(aiSessions)
      .values({
        workspace_id: workspaceId,
        title,
      })
      .returning();
    return session;
  }

  /**
   * Get all chat sessions for a workspace.
   */
  static async getSessions(workspaceId: string) {
    return await db
      .select({
        id: aiSessions.id,
        title: aiSessions.title,
        updatedAt: aiSessions.updated_at,
      })
      .from(aiSessions)
      .where(
        and(
          eq(aiSessions.workspace_id, workspaceId),
          isNull(aiSessions.deleted_at),
        ),
      )
      .orderBy(desc(aiSessions.updated_at));
  }

  /**
   * Get a specific session.
   */
  static async getSession(sessionId: string, workspaceId: string) {
    const [session] = await db
      .select()
      .from(aiSessions)
      .where(
        and(
          eq(aiSessions.id, sessionId),
          eq(aiSessions.workspace_id, workspaceId),
          isNull(aiSessions.deleted_at),
        ),
      );
    return session;
  }

  /**
   * Save a single message to a session and touch the session updated_at.
   */
  static async saveMessage(
    sessionId: string,
    role: "user" | "assistant" | "system",
    content: string,
  ) {
    await db.transaction(async (tx) => {
      await tx.insert(aiMessages).values({
        session_id: sessionId,
        role,
        content,
      });
      await tx
        .update(aiSessions)
        .set({ updated_at: new Date() })
        .where(eq(aiSessions.id, sessionId));
    });
  }

  /**
   * Get all messages for a session.
   */
  static async getSessionMessages(sessionId: string) {
    return await db
      .select({
        id: aiMessages.id,
        role: aiMessages.role,
        content: aiMessages.content,
        createdAt: aiMessages.created_at,
      })
      .from(aiMessages)
      .where(eq(aiMessages.session_id, sessionId))
      .orderBy(aiMessages.created_at);
  }
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

  /**
   * Get AI token usage and quota metrics for a workspace.
   */
  static async getUsageAndQuota(workspaceId: string) {
    const [usageData] = await db
      .select({
        used: workspaces.ai_tokens_used,
        maxTokens: pricing.max_ai_tokens,
      })
      .from(workspaces)
      .leftJoin(pricing, eq(workspaces.plan_id, pricing.id))
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    return usageData;
  }

  /**
   * Safely increment the token usage tracker.
   */
  static async incrementAiTokens(
    workspaceId: string,
    currentTokens: number,
    tokensSpent: number,
  ) {
    await db
      .update(workspaces)
      .set({ ai_tokens_used: currentTokens + tokensSpent })
      .where(eq(workspaces.id, workspaceId));
  }
}
