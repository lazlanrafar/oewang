import { and, db, eq, push_subscriptions } from "@workspace/database";

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
        set: { subscription, user_id, workspace_id },
      })
      .returning();
    return row;
  }

  static async deleteByEndpoint(user_id: string, endpoint: string) {
    await db
      .delete(push_subscriptions)
      .where(
        and(
          eq(push_subscriptions.user_id, user_id),
          eq(push_subscriptions.endpoint, endpoint),
        ),
      );
  }

  static async findByUserId(user_id: string) {
    return db
      .select()
      .from(push_subscriptions)
      .where(eq(push_subscriptions.user_id, user_id));
  }

  static async findByWorkspaceId(workspace_id: string) {
    return db
      .select()
      .from(push_subscriptions)
      .where(eq(push_subscriptions.workspace_id, workspace_id));
  }
}
