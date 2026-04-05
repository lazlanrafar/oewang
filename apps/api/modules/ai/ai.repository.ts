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
  debts,
  contacts,
  workspaceAddons,
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
    workspaceId: string,
    role: "user" | "assistant" | "system",
    content: string,
    attachments?: any,
  ) {
    await db.transaction(async (tx) => {
      // Verify session exists and belongs to workspace
      const [session] = await tx
        .select()
        .from(aiSessions)
        .where(
          and(
            eq(aiSessions.id, sessionId),
            eq(aiSessions.workspace_id, workspaceId),
            isNull(aiSessions.deleted_at),
          ),
        );

      if (!session) throw new Error("Session not found or access denied");

      await tx.insert(aiMessages).values({
        session_id: sessionId,
        workspace_id: workspaceId,
        role,
        content,
        attachments,
      });

      await tx
        .update(aiSessions)
        .set({ updated_at: new Date() })
        .where(
          and(eq(aiSessions.id, sessionId), isNull(aiSessions.deleted_at)),
        );
    });
  }

  /**
   * Get all messages for a session.
   */
  static async getSessionMessages(sessionId: string, workspaceId: string) {
    return await db
      .select({
        id: aiMessages.id,
        role: aiMessages.role,
        content: aiMessages.content,
        attachments: aiMessages.attachments,
        createdAt: aiMessages.created_at,
      })
      .from(aiMessages)
      .where(
        and(
          eq(aiMessages.session_id, sessionId),
          eq(aiMessages.workspace_id, workspaceId),
          isNull(aiMessages.deleted_at),
        ),
      )
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
        extraTokens: workspaces.extra_ai_tokens,
        xendit_current_period_end: workspaces.xendit_current_period_end,
        created_at: workspaces.created_at,
      })
      .from(workspaces)
      .leftJoin(pricing, eq(workspaces.plan_id, pricing.id))
      .where(
        and(
          eq(workspaces.id, workspaceId),
          isNull(workspaces.deleted_at),
          isNull(pricing.deleted_at),
        ),
      )
      .limit(1);

    if (!usageData) return null;

    // Fetch active recurring AI add-ons
    const activeAiAddons = await db
      .select({
        amount: workspaceAddons.amount,
      })
      .from(workspaceAddons)
      .innerJoin(pricing, eq(workspaceAddons.addon_id, pricing.id))
      .where(
        and(
          eq(workspaceAddons.workspace_id, workspaceId),
          eq(workspaceAddons.status, "active"),
          eq(pricing.addon_type, "ai"),
          isNull(workspaceAddons.deleted_at),
        ),
      );

    const recurringExtraAi = activeAiAddons.reduce(
      (sum, a) => sum + (a.amount || 0),
      0,
    );

    return {
      ...usageData,
      maxTokens:
        (usageData.maxTokens || 0) +
        (usageData.extraTokens || 0) +
        recurringExtraAi,
    };
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
      .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deleted_at)));
  }
}
