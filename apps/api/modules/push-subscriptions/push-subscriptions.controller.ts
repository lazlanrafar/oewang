import { Elysia, status } from "elysia";
import { PushSubscriptionsService } from "./push-subscriptions.service";
import { PushSubscriptionDto } from "./push-subscriptions.dto";
import { authPlugin } from "../../plugins/auth";
import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";

export const pushSubscriptionsController = new Elysia({ prefix: "/push-subscriptions" })
  .use(authPlugin)
  .get("/vapid-key", () => PushSubscriptionsService.getPublicKey())
  .post(
    "/",
    async ({ auth, body }) => {
      if (!auth?.user_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthenticated"));
      }
      return PushSubscriptionsService.register(auth.user_id, auth.workspace_id ?? "", body.subscription);
    },
    { body: PushSubscriptionDto.register },
  )
  .delete(
    "/",
    async ({ auth, body }) => {
      if (!auth?.user_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthenticated"));
      }
      return PushSubscriptionsService.unregister(auth.user_id, body.endpoint);
    },
    { body: PushSubscriptionDto.unregister },
  );
