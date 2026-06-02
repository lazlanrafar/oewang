import type { NewWorkspaceIntegration } from "@workspace/database";
import {
  db,
  user_workspaces,
  workspaceIntegrations,
  workspaces,
} from "@workspace/database";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

export abstract class IntegrationsRepository {
  static async findByProvider(workspace_id: string, provider: string) {
    const records = await db
      .select()
      .from(workspaceIntegrations)
      .where(
        and(
          eq(workspaceIntegrations.workspaceId, workspace_id),
          eq(workspaceIntegrations.provider, provider),
        ),
      )
      .orderBy(desc(workspaceIntegrations.updatedAt))
      .limit(1);
    return records[0] || null;
  }

  static async findAll(workspace_id: string) {
    return db
      .select()
      .from(workspaceIntegrations)
      .where(
        and(
          eq(workspaceIntegrations.workspaceId, workspace_id),
          eq(workspaceIntegrations.isActive, true),
          isNull(workspaceIntegrations.deletedAt),
        ),
      );
  }

  static async findByWhatsAppNumber(
    phoneNumber: string,
    provider = "whatsapp",
  ) {
    // Find the workspace tied to this specific WhatsApp phone number
    const records = await db
      .select()
      .from(workspaceIntegrations)
      .where(
        and(
          eq(workspaceIntegrations.provider, provider),
          eq(workspaceIntegrations.isActive, true),
          isNull(workspaceIntegrations.deletedAt),
          sql`${workspaceIntegrations.settings}->>'phoneNumber' = ${phoneNumber}`,
        ),
      )
      .limit(1);
    return records[0] || null;
  }

  static async findByTelegramChatId(chatId: string) {
    // Find the workspace tied to this specific Telegram chat ID
    const records = await db
      .select()
      .from(workspaceIntegrations)
      .where(
        and(
          eq(workspaceIntegrations.provider, "telegram"),
          eq(workspaceIntegrations.isActive, true),
          isNull(workspaceIntegrations.deletedAt),
          sql`${workspaceIntegrations.settings}->>'telegramChatId' = ${chatId}`,
        ),
      )
      .limit(1);
    return records[0] || null;
  }

  static async upsert(
    data: NewWorkspaceIntegration & { connectedBy?: string },
  ) {
    const now = new Date().toISOString();
    const existing = await IntegrationsRepository.findByProvider(
      data.workspaceId,
      data.provider,
    );

    if (existing) {
      const [updated] = await db
        .update(workspaceIntegrations)
        .set({
          settings: data.settings,
          isActive: data.isActive ?? true,
          connectedAt: data.isActive !== false ? now : existing.connectedAt,
          connectedBy: data.connectedBy ?? existing.connectedBy,
          deletedAt: null,
          updatedAt: now,
        })
        .where(eq(workspaceIntegrations.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(workspaceIntegrations)
      .values({
        ...data,
        isActive: data.isActive ?? true,
        connectedAt: data.isActive !== false ? now : null,
        connectedBy: data.connectedBy,
      })
      .returning();
    return created;
  }

  static async updateSettings(id: string, workspaceId: string, settings: any) {
    const [updated] = await db
      .update(workspaceIntegrations)
      .set({
        settings,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(workspaceIntegrations.id, id),
          eq(workspaceIntegrations.workspaceId, workspaceId),
          isNull(workspaceIntegrations.deletedAt),
        ),
      )
      .returning();
    return updated;
  }

  static async findFirstMemberId(workspaceId: string) {
    const [membership] = await db
      .select({ userId: user_workspaces.user_id })
      .from(user_workspaces)
      .where(
        and(
          eq(user_workspaces.workspace_id, workspaceId),
          isNull(user_workspaces.deleted_at),
        ),
      )
      .limit(1);
    return membership?.userId || null;
  }

  static async findWorkspaceIdBySlug(slug: string) {
    const [workspace] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.slug, slug), isNull(workspaces.deleted_at)))
      .limit(1);
    return workspace?.id || null;
  }

  static async disconnectByProvider(workspaceId: string, provider: string) {
    const [disconnected] = await db
      .update(workspaceIntegrations)
      .set({
        isActive: false,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(workspaceIntegrations.workspaceId, workspaceId),
          eq(workspaceIntegrations.provider, provider),
          eq(workspaceIntegrations.isActive, true),
        ),
      )
      .returning();

    return disconnected || null;
  }
}
