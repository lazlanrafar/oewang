import { and, db, device_tokens, eq, isNull, sql } from "@workspace/database";

export abstract class DeviceTokensRepository {
  static async upsert(
    user_id: string,
    workspace_id: string,
    token: string,
    platform: string,
  ) {
    const [row] = await db
      .insert(device_tokens)
      .values({ user_id, workspace_id, token, platform })
      .onConflictDoUpdate({
        target: device_tokens.token,
        // Revive a previously soft-deleted token on re-register.
        set: { platform, user_id, workspace_id, deleted_at: null },
      })
      .returning();
    return row;
  }

  static async deleteByToken(user_id: string, token: string) {
    // Soft delete — workspace-scoped rows are never hard-deleted.
    await db
      .update(device_tokens)
      .set({ deleted_at: sql`now()` })
      .where(
        and(
          eq(device_tokens.user_id, user_id),
          eq(device_tokens.token, token),
          isNull(device_tokens.deleted_at),
        ),
      );
  }

  static async deleteByTokenValue(token: string) {
    // Used when pruning tokens FCM reports as unregistered — the caller
    // (send path) doesn't necessarily know which user_id owns the token.
    await db
      .update(device_tokens)
      .set({ deleted_at: sql`now()` })
      .where(
        and(eq(device_tokens.token, token), isNull(device_tokens.deleted_at)),
      );
  }

  static async findByUserId(user_id: string) {
    return db
      .select()
      .from(device_tokens)
      .where(
        and(
          eq(device_tokens.user_id, user_id),
          isNull(device_tokens.deleted_at),
        ),
      );
  }

  static async findByWorkspaceId(workspace_id: string) {
    return db
      .select()
      .from(device_tokens)
      .where(
        and(
          eq(device_tokens.workspace_id, workspace_id),
          isNull(device_tokens.deleted_at),
        ),
      );
  }
}
