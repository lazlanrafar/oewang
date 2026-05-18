import { buildPaginatedSuccess, buildSuccess, buildPagination } from "@workspace/utils";
import { NotificationsRepository } from "./notifications.repository";
import type { NotificationListQuery } from "./notifications.dto";
import type { InsertNotification } from "@workspace/database";
import { RealtimeService } from "../realtime/realtime.service";
import { PushSubscriptionsService } from "../push-subscriptions/push-subscriptions.service";

export abstract class NotificationsService {
  static async getAll(
    workspace_id: string,
    user_id: string,
    query: NotificationListQuery,
  ) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);

    const { rows, total } = await NotificationsRepository.findAll(
      workspace_id,
      user_id,
      page,
      limit,
    );

    return buildPaginatedSuccess(rows, buildPagination(total, page, limit));
  }

  static async markAsRead(
    workspace_id: string,
    user_id: string,
    ids: string[],
  ) {
    await NotificationsRepository.markAsRead(workspace_id, user_id, ids);
    return buildSuccess(null, "Notifications marked as read");
  }

  static async delete(workspace_id: string, user_id: string, id: string) {
    await NotificationsRepository.softDelete(workspace_id, user_id, id);
    return buildSuccess(null, "Notification deleted");
  }

  static async create(data: InsertNotification) {
    const notification = await NotificationsRepository.create(data);

    // Broadcast realtime event so connected clients refresh immediately
    RealtimeService.notifyValueChange(data.workspace_id, "notifications");

    // Send browser push notification if user has subscriptions
    PushSubscriptionsService.sendToUser(data.user_id, {
      title: data.title,
      body: data.message,
      url: data.link ?? "/notifications",
    }).catch(() => {
      // Non-blocking: push failures should not break the main flow
    });

    return notification;
  }
}
