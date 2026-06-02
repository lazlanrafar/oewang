import { buildSuccess } from "@workspace/utils";
import type { UpdateNotificationSettingInput } from "../notifications/notifications.dto";
import { NotificationSettingsRepository } from "./notification-settings.repository";

export abstract class NotificationSettingsService {
  static async get(workspace_id: string, user_id: string) {
    const settings = await NotificationSettingsRepository.findByUserId(
      workspace_id,
      user_id,
    );
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
    return buildSuccess(updated, "Notification settings updated");
  }
}
