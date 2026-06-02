import {
  and,
  db,
  eq,
  isNull,
  notification_settings,
} from "@workspace/database";
import type { UpdateNotificationSettingInput } from "../notifications/notifications.dto";

export abstract class NotificationSettingsRepository {
  static async findByUserId(workspace_id: string, user_id: string) {
    const [row] = await db
      .select()
      .from(notification_settings)
      .where(
        and(
          eq(notification_settings.workspace_id, workspace_id),
          eq(notification_settings.user_id, user_id),
          isNull(notification_settings.deleted_at),
        ),
      )
      .limit(1);

    if (!row) {
      // Create default settings if not exists
      const [newRow] = await db
        .insert(notification_settings)
        .values({
          workspace_id,
          user_id,
        })
        .returning();
      return newRow;
    }

    return row;
  }

  static async update(
    workspace_id: string,
    user_id: string,
    data: UpdateNotificationSettingInput,
  ) {
    const [row] = await db
      .update(notification_settings)
      .set({ ...data, updated_at: new Date() })
      .where(
        and(
          eq(notification_settings.workspace_id, workspace_id),
          eq(notification_settings.user_id, user_id),
          isNull(notification_settings.deleted_at),
        ),
      )
      .returning();

    return row;
  }
}
