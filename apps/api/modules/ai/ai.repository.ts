import {
  db,
  eq,
  and,
  desc,
  isNull,
  aiSessions,
  aiMessages,
  workspaces,
  pricing,
  workspaceAddons,
  sql,
} from "@workspace/database";

export abstract class AiRepository {
  static async createSession(workspaceId: string, title: string) {
    const [session] = await db
      .insert(aiSessions)
      .values({
        workspace_id: workspaceId,
        title,
      })
      .returning();
    return session || null;
  }

  static async saveMessage(
    sessionId: string,
    workspaceId: string,
    role: "user" | "assistant" | "system",
    content: string,
    attachments?: any,
  ) {
    const [message] = await db
      .insert(aiMessages)
      .values({
        session_id: sessionId,
        workspace_id: workspaceId,
        role,
        content,
        attachments,
      })
      .returning();
    return message || null;
  }

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
      )
      .limit(1);
    return session || null;
  }

  static async getSessionMessages(sessionId: string, workspaceId: string) {
    return db
      .select()
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

  static async getSessions(workspaceId: string) {
    return db
      .select()
      .from(aiSessions)
      .where(
        and(
          eq(aiSessions.workspace_id, workspaceId),
          isNull(aiSessions.deleted_at),
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

  static async incrementAiTokens(
    workspaceId: string,
    currentTokens: number,
    tokensSpent: number,
  ) {
    return db
      .update(workspaces)
      .set({
        ai_tokens_used: currentTokens + tokensSpent,
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
