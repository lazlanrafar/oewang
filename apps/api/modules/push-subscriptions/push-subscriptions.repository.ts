import { and, db, eq, isNull, push_subscriptions, sql } from "@workspace/database";

export abstract class PushSubscriptionsRepository {
  static async upsert(
    user_id: string,
    workspace_id: string,
    endpoint: string,
    subscription: string,
  ) {
    const [row] = await db
      .insert(push_subscriptions)
      .values({ user_id, workspace_id, endpoint, subscription })
      .onConflictDoUpdate({
        target: push_subscriptions.endpoint,
        // Revive a previously soft-deleted endpoint on re-subscribe.
        set: { subscription, user_id, workspace_id, deleted_at: null },
      })
      .returning();
    return row;
  }

  static async deleteByEndpoint(user_id: string, endpoint: string) {
    // Soft delete — workspace-scoped rows are never hard-deleted.
    await db
      .update(push_subscriptions)
      .set({ deleted_at: sql`now()` })
      .where(
        and(
          eq(push_subscriptions.user_id, user_id),
          eq(push_subscriptions.endpoint, endpoint),
          isNull(push_subscriptions.deleted_at),
        ),
      );
  }

  static async findByUserId(user_id: string) {
    return db
      .select()
      .from(push_subscriptions)
      .where(
        and(
          eq(push_subscriptions.user_id, user_id),
          isNull(push_subscriptions.deleted_at),
        ),
      );
  }

  static async findByWorkspaceId(workspace_id: string) {
    return db
      .select()
      .from(push_subscriptions)
      .where(
        and(
          eq(push_subscriptions.workspace_id, workspace_id),
          isNull(push_subscriptions.deleted_at),
        ),
      );
  }
}
