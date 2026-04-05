import { Elysia } from "elysia";
import { NotificationsService } from "./notifications.service";
import { NotificationDto } from "./notifications.dto";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { status } from "elysia";
import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";

export const notificationsController = new Elysia({ prefix: "/notifications" })
  .use(authPlugin)
  .use(encryptionPlugin)
  .get(
    "/",
    async ({ auth, query }) => {
      if (!auth?.user_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthenticated"));
      }

      if (!auth.workspace_id) {
        return buildSuccess({
          rows: [],
          meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
        });
      }

      return NotificationsService.getAll(
        auth.workspace_id,
        auth.user_id,
        query,
      );
    },
    { query: NotificationDto.listQuery },
  )
  .patch(
    "/mark-read",
    async ({ auth, body }) => {
      if (!auth?.user_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthenticated"));
      }

      if (!auth.workspace_id) {
        // Return empty notifications if no workspace is active instead of throwing 401
        return buildSuccess({
          rows: [],
          meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
        });
      }

      return NotificationsService.markAsRead(
        auth.workspace_id,
        auth.user_id,
        body.ids,
      );
    },
    { body: NotificationDto.markRead },
  )
  .delete(
    "/:id",
    async ({ auth, params }) => {
      if (!auth?.user_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthenticated"));
      }

      if (!auth.workspace_id) {
        return buildSuccess(null);
      }

      return NotificationsService.delete(
        auth.workspace_id,
        auth.user_id,
        params.id,
      );
    },
  );
