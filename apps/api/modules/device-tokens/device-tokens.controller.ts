import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { Elysia, status } from "elysia";
import { PushSubscriptionsRepository } from "../push-subscriptions/push-subscriptions.repository";
import { PushSubscriptionsService } from "../push-subscriptions/push-subscriptions.service";
import { requireAdminAccess } from "../system-admins/system-admins.controller";
import { authPlugin } from "../../plugins/auth";
import { DeviceTokenDto } from "./device-tokens.dto";
import { DeviceTokensRepository } from "./device-tokens.repository";
import { DeviceTokensService } from "./device-tokens.service";

export const deviceTokensController = new Elysia({ prefix: "/device-tokens" })
  .use(authPlugin)
  .post(
    "/",
    async ({ auth, body }) => {
      if (!auth?.user_id) {
        throw status(
          401,
          buildError(ErrorCode.UNAUTHORIZED, "Unauthenticated"),
        );
      }
      return DeviceTokensService.register(
        auth.user_id,
        auth.workspace_id ?? "",
        body.token,
        body.platform,
      );
    },
    { body: DeviceTokenDto.register },
  )
  .delete(
    "/",
    async ({ auth, body }) => {
      if (!auth?.user_id) {
        throw status(
          401,
          buildError(ErrorCode.UNAUTHORIZED, "Unauthenticated"),
        );
      }
      return DeviceTokensService.unregister(auth.user_id, body.token);
    },
    { body: DeviceTokenDto.unregister },
  )
  .use(requireAdminAccess)
  .post(
    "/test-send",
    async ({ auth, body }) => {
      const targetUserId = body.user_id || auth!.user_id;
      await Promise.allSettled([
        PushSubscriptionsService.sendToUser(targetUserId, {
          title: body.title,
          body: body.body,
        }),
        DeviceTokensService.sendToUser(targetUserId, {
          title: body.title,
          body: body.body,
        }),
      ]);
      return buildSuccess(null, "Test push dispatched");
    },
    { body: DeviceTokenDto.testSend },
  )
  .get("/status", async ({ query, auth }) => {
    const targetUserId = (query.user_id as string | undefined) || auth!.user_id;
    const [deviceTokens, webPushSubs] = await Promise.all([
      DeviceTokensRepository.findByUserId(targetUserId),
      PushSubscriptionsRepository.findByUserId(targetUserId),
    ]);
    return buildSuccess({
      device_tokens: deviceTokens.length,
      web_push_subscriptions: webPushSubs.length,
    });
  });
