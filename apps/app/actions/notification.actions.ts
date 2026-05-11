import type { Notification, NotificationSetting } from "@workspace/database";
import { axiosInstance as api } from "@workspace/modules/client";
import type { ApiResponse, PaginatedList } from "@workspace/types";

import type {
  NotificationListQuery,
  UpdateNotificationSettingInput,
} from "../../api/modules/notifications/notifications.dto";

export async function getNotifications(query: NotificationListQuery) {
  const { data } = await api.get<ApiResponse<PaginatedList<Notification>>>("/notifications", { params: query });
  return data;
}

export async function markNotificationsRead(ids: string[]) {
  const { data } = await api.patch<ApiResponse<null>>("/notifications/mark-read", { ids });
  return data;
}

export async function deleteNotification(id: string) {
  const { data } = await api.delete<ApiResponse<null>>(`/notifications/${id}`);
  return data;
}

export async function getNotificationSettings() {
  const { data } = await api.get<ApiResponse<NotificationSetting>>("/notification-settings");
  return data;
}

export async function updateNotificationSettings(payload: UpdateNotificationSettingInput) {
  const { data } = await api.patch<ApiResponse<NotificationSetting>>("/notification-settings", payload);
  return data;
}
