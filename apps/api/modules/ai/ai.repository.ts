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
        plan_current_period_end: workspaces.plan_current_period_end,
        created_at: workspaces.created_at,
      })
      .from(workspaces)
      .leftJoin(pricing, eq(workspaces.plan_id, pricing.id))
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!row) return null;

    return {
      used: row.used,
      maxTokens: (row.maxTokens || 0) + row.extra,
      plan_current_period_end: row.plan_current_period_end,
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
}
