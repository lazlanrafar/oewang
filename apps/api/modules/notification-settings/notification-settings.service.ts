import { buildSuccess } from "@workspace/utils";
import { cacheDel, cacheGet, cacheSet } from "../../lib/cache";
import type { UpdateNotificationSettingInput } from "../notifications/notifications.dto";
import { NotificationSettingsRepository } from "./notification-settings.repository";

const NS_TTL = 60 * 60 * 24; // 24h
const nsKey = (workspaceId: string, userId: string) =>
  `oewang:notification-settings:${workspaceId}:${userId}`;

export abstract class NotificationSettingsService {
  static async get(workspace_id: string, user_id: string) {
    const key = nsKey(workspace_id, user_id);
    const cached = await cacheGet<object>(key);
    if (cached) return buildSuccess(cached);

    const settings = await NotificationSettingsRepository.findByUserId(
      workspace_id,
      user_id,
    );
    await cacheSet(key, settings, NS_TTL);
    return buildSuccess(settings);
  }

  static async update(
    workspace_id: string,
    user_id: string,
    data: UpdateNotificationSettingInput,
  ) {
    const updated = await NotificationSettingsRepository.update(
      workspace_id,
      user_id,
      data,
    );

    await cacheDel(nsKey(workspace_id, user_id));

    return buildSuccess(updated, "Notification settings updated");
  }
}
