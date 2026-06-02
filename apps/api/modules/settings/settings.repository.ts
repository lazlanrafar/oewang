import { db, workspaceSettings } from "@workspace/database";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { TransactionSettingsInput } from "./settings.model";

type WorkspaceSetting = typeof workspaceSettings.$inferSelect;

export abstract class SettingsRepository {
  static async findByWorkspaceId(
    workspaceId: string,
  ): Promise<WorkspaceSetting | null> {
    const [settings] = await db
      .select()
      .from(workspaceSettings)
      .where(
        and(
          eq(workspaceSettings.workspaceId, workspaceId),
          isNull(workspaceSettings.deletedAt),
        ),
      )
      .limit(1);

    return (settings as unknown as WorkspaceSetting) || null;
  }

  static async create(
    workspaceId: string,
    data?: Partial<TransactionSettingsInput>,
    tx: any = db,
  ): Promise<WorkspaceSetting> {
    const [settings] = await tx
      .insert(workspaceSettings)
      .values({
        workspaceId,
        ...data,
      })
      .returning();

    return settings as unknown as WorkspaceSetting;
  }

  static async update(
    workspaceId: string,
    data: Partial<TransactionSettingsInput>,
  ): Promise<WorkspaceSetting> {
    const [settings] = await db
      .update(workspaceSettings)
      .set({
        ...data,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(workspaceSettings.workspaceId, workspaceId),
          isNull(workspaceSettings.deletedAt),
        ),
      )
      .returning();

    return settings as unknown as WorkspaceSetting;
  }
}
