import type { InsertNotification } from "@workspace/database";
import {
  and,
  db,
  desc,
  eq,
  inArray,
  isNull,
  notifications,
  sql,
} from "@workspace/database";

export abstract class NotificationsRepository {
  static async findAll(
    workspace_id: string,
    user_id: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.workspace_id, workspace_id),
          eq(notifications.user_id, user_id),
          isNull(notifications.deleted_at),
        ),
      )
      .limit(limit)
      .offset((page - 1) * limit)
      .orderBy(desc(notifications.created_at));

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(
          eq(notifications.workspace_id, workspace_id),
          eq(notifications.user_id, user_id),
          isNull(notifications.deleted_at),
        ),
      );

    return { rows, total: Number(countResult?.count || 0) };
  }

  static async create(data: InsertNotification) {
    const [row] = await db.insert(notifications).values(data).returning();
    return row;
  }

  static async markAsRead(
    workspace_id: string,
    user_id: string,
    ids: string[],
  ) {
    await db
      .update(notifications)
      .set({ is_read: true })
      .where(
        and(
          eq(notifications.workspace_id, workspace_id),
          eq(notifications.user_id, user_id),
          inArray(notifications.id, ids),
          isNull(notifications.deleted_at),
        ),
      );
  }

  static async softDelete(workspace_id: string, user_id: string, id: string) {
    await db
      .update(notifications)
      .set({ deleted_at: new Date() })
      .where(
        and(
          eq(notifications.workspace_id, workspace_id),
          eq(notifications.user_id, user_id),
          eq(notifications.id, id),
          isNull(notifications.deleted_at),
        ),
      );
  }
}
