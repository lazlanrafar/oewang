import { eq, and, sql, isNull } from "drizzle-orm";
import { db, workspaceIntegrations, user_workspaces } from "@workspace/database";
import type { NewWorkspaceIntegration } from "@workspace/database";

export abstract class IntegrationsRepository {
  static async findByProvider(workspace_id: string, provider: string) {
    const records = await db
      .select()
      .from(workspaceIntegrations)
      .where(
        and(
          eq(workspaceIntegrations.workspaceId, workspace_id),
          eq(workspaceIntegrations.provider, provider),
          isNull(workspaceIntegrations.deletedAt),
        ),
      )
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
          isNull(workspaceIntegrations.deletedAt),
        ),
      );
  }

  static async findByWhatsAppNumber(phoneNumber: string) {
    // Find the workspace tied to this specific WhatsApp phone number
    const records = await db
      .select()
      .from(workspaceIntegrations)
      .where(
        and(
          eq(workspaceIntegrations.provider, "whatsapp"),
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

  static async upsert(data: NewWorkspaceIntegration) {
    const existing = await this.findByProvider(data.workspaceId, data.provider);

    if (existing) {
      const [updated] = await db
        .update(workspaceIntegrations)
        .set({
          settings: data.settings,
          isActive: data.isActive,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(workspaceIntegrations.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(workspaceIntegrations)
      .values(data)
      .returning();
    return created;
  }

  static async updateSettings(id: string, settings: any) {
    const [updated] = await db
      .update(workspaceIntegrations)
      .set({
        settings,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workspaceIntegrations.id, id))
      .returning();
    return updated;
  }

  static async findFirstMemberId(workspaceId: string) {
    const [membership] = await db
      .select({ userId: user_workspaces.user_id })
      .from(user_workspaces)
      .where(eq(user_workspaces.workspace_id, workspaceId))
      .limit(1);
    return membership?.userId || null;
  }
}
