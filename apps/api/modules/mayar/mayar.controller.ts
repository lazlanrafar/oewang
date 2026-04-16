import { Elysia } from "elysia";
import { MayarService } from "./mayar.service";
import { CreateMayarCheckoutDto, MayarWebhookDto } from "./mayar.dto";
import { authPlugin } from "../../plugins/auth";
import { buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";

export const mayarController = new Elysia({
  prefix: "/mayar",
  name: "mayar.controller",
})
  .post(
    "/webhook",
    async ({ body, headers }) => {
      try {
        const token = headers["x-mayar-token"];
        await MayarService.handleWebhook(body, token);
        return { success: true };
      } catch (err: any) {
        console.error("[Mayar Webhook Error]", err.stack || err.message);
        return { success: false, error: err.message };
      }
    },
    {
      body: MayarWebhookDto,
      detail: { summary: "Mayar Webhook", tags: ["Mayar"] },
    },
  )
  .use(authPlugin)
  .post(
    "/checkout",
    async ({ body, auth, status }) => {
      if (!auth) return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));

      const { priceId, workspaceId, returnPath, type, addonType, amount, addonId, billing } = body;

      return MayarService.createCheckoutSession(
        workspaceId || auth.workspace_id,
        auth.user_id,
        priceId,
        returnPath,
        {
          metadata: {
            type,
            addonType,
            amount,
            addonId,
            billing,
          },
        },
      );
    },
    {
      body: CreateMayarCheckoutDto,
      detail: { summary: "Create Mayar Checkout Session", tags: ["Mayar"] },
    },
  )
  .post(
    "/portal",
    async ({ auth, status }) => {
      if (!auth) return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      // Redirect to billing settings — Mayar manages subscriptions via their dashboard
      return { url: `${process.env.NEXT_PUBLIC_APP_URL}/en/settings/billing` };
    },
    { detail: { summary: "Customer Portal Redirect", tags: ["Mayar"] } },
  )
  .get(
    "/invoices/:id",
    async ({ params }) => {
      return MayarService.getInvoiceUrl(params.id);
    },
    { detail: { summary: "Get Invoice URL", tags: ["Mayar"] } },
  )
  .post(
    "/cancel-subscription",
    async ({ auth, status }) => {
      if (!auth) return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      return MayarService.cancelSubscription(auth.workspace_id);
    },
    { detail: { summary: "Cancel Subscription", tags: ["Mayar"] } },
  );
