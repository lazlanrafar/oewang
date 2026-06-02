import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { Elysia, status } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { NotificationSettingDto } from "../notifications/notifications.dto";
import { NotificationSettingsService } from "./notification-settings.service";

export const notificationSettingsController = new Elysia({
  prefix: "/notification-settings",
})
  .use(authPlugin)
  .use(encryptionPlugin)
  .get("/", async ({ auth }) => {
    if (!auth?.workspace_id) {
      throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
    }
    return NotificationSettingsService.get(auth.workspace_id, auth.user_id);
  })
  .patch(
    "/",
    async ({ auth, body }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      return NotificationSettingsService.update(
        auth.workspace_id,
        auth.user_id,
        body,
      );
    },
    { body: NotificationSettingDto.update },
  );
