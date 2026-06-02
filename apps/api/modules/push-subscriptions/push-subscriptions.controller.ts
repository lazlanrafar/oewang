import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { Elysia, status } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { PushSubscriptionDto } from "./push-subscriptions.dto";
import { PushSubscriptionsService } from "./push-subscriptions.service";

export const pushSubscriptionsController = new Elysia({
  prefix: "/push-subscriptions",
})
  .use(authPlugin)
  .get("/vapid-key", () => PushSubscriptionsService.getPublicKey())
  .post(
    "/",
    async ({ auth, body }) => {
      if (!auth?.user_id) {
        throw status(
          401,
          buildError(ErrorCode.UNAUTHORIZED, "Unauthenticated"),
        );
      }
      return PushSubscriptionsService.register(
        auth.user_id,
        auth.workspace_id ?? "",
        body.subscription,
      );
    },
    { body: PushSubscriptionDto.register },
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
      return PushSubscriptionsService.unregister(auth.user_id, body.endpoint);
    },
    { body: PushSubscriptionDto.unregister },
  );
