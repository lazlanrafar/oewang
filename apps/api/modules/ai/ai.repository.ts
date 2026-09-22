import {
  aiMessages,
  aiSessions,
  and,
  db,
  desc,
  eq,
  isNull,
  pricing,
  or,
  getTableColumns,
  sql,
  workspaceAddons,
  workspaces,
} from "@workspace/database";

export abstract class AiRepository {
  static async getSession(sessionId: string, workspaceId: string, userId: string) {
    const [session] = await db
      .select()
      .from(aiSessions)
      .where(
        and(
          eq(aiSessions.id, sessionId),
          eq(aiSessions.workspace_id, workspaceId),
          isNull(aiSessions.deleted_at),
          or(eq(aiSessions.user_id, userId), isNull(aiSessions.user_id)),
        ),
      )
      .limit(1);
    return session || null;
  }

  static async getSessionMessages(
    sessionId: string,
    workspaceId: string,
    userId: string,
    limit = 20,
  ) {
    // Last `limit` messages, oldest-first. Unbounded history gets resent to
    // the LLM on every tool-loop step — O(n²) input tokens per session.
    const rows = await db
      .select(getTableColumns(aiMessages))
      .from(aiMessages)
      .innerJoin(aiSessions, eq(aiSessions.id, aiMessages.session_id))
      .where(
        and(
          eq(aiMessages.session_id, sessionId),
          eq(aiMessages.workspace_id, workspaceId),
          isNull(aiMessages.deleted_at),
          eq(aiSessions.workspace_id, workspaceId),
          isNull(aiSessions.deleted_at),
          or(eq(aiSessions.user_id, userId), isNull(aiSessions.user_id)),
        ),
      )
      .orderBy(desc(aiMessages.created_at))
      .limit(limit);
    return rows.reverse();
  }

  static async getSessions(workspaceId: string, userId: string) {
    return db
      .select()
      .from(aiSessions)
      .where(
        and(
          eq(aiSessions.workspace_id, workspaceId),
          isNull(aiSessions.deleted_at),
          or(eq(aiSessions.user_id, userId), isNull(aiSessions.user_id)),
        ),
      )
      .orderBy(desc(aiSessions.updated_at));
  }

  static async getUsageAndQuota(workspaceId: string) {
    const [row] = await db
      .select({
        used: workspaces.ai_tokens_used,
        extra: workspaces.extra_ai_tokens,
        maxTokens: pricing.max_ai_tokens,
        plan_status: workspaces.plan_status,
        plan_billing_interval: workspaces.plan_billing_interval,
        plan_current_period_end: workspaces.plan_current_period_end,
        ai_tokens_reset_at: workspaces.ai_tokens_reset_at,
        created_at: workspaces.created_at,
      })
      .from(workspaces)
      .leftJoin(pricing, eq(workspaces.plan_id, pricing.id))
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!row) return null;

    // Sum up recurring AI addons
    const activeAddons = await db
      .select({
        maxTokens: pricing.max_ai_tokens,
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

    const recurringExtraAi = activeAddons.reduce(
      (sum, a) => sum + (a.maxTokens || 0),
      0,
    );

    return {
      used: row.used,
      maxTokens: (row.maxTokens || 0) + row.extra + recurringExtraAi,
      plan_status: row.plan_status,
      plan_billing_interval: row.plan_billing_interval,
      plan_current_period_end: row.plan_current_period_end,
      ai_tokens_reset_at: row.ai_tokens_reset_at,
      created_at: row.created_at,
    };
  }

  static async incrementAiTokens(workspaceId: string, tokensSpent: number) {
    // Atomic increment — a read-modify-write here loses updates when two
    // chats in the same workspace finish concurrently.
    return db
      .update(workspaces)
      .set({
        ai_tokens_used: sql`${workspaces.ai_tokens_used} + ${tokensSpent}`,
        updated_at: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));
  }

  static async resetAiTokens(workspaceId: string, resetAt: Date) {
    return db
      .update(workspaces)
      .set({
        ai_tokens_used: 0,
        ai_tokens_reset_at: resetAt,
        updated_at: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));
  }
}
