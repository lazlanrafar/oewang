import { Elysia, t } from "elysia";
import { XenditService } from "./xendit.service";
import { CreateXenditCheckoutDto, XenditWebhookDto } from "./xendit.dto";
import { authPlugin } from "../../plugins/auth";
import { buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";

export const xenditController = new Elysia({
  prefix: "/xendit",
  name: "xendit.controller",
})
  .post(
    "/webhook",
    async ({ request, body }) => {
      const callbackToken = request.headers.get("x-callback-token") || "";

      try {
        await XenditService.handleWebhook(body, callbackToken);
        return { success: true };
      } catch (err: any) {
        console.error("[Xendit Webhook Error]", err.stack || err.message);
        return { success: false, error: err.message };
      }
    },
    { 
       body: XenditWebhookDto,
       detail: { summary: "Xendit Webhook", tags: ["Xendit"] } 
    },
  )
  .use(authPlugin)
  .post(
    "/checkout",
    async ({ body, auth, status }) => {
      if (!auth) return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      
      const { priceId, workspaceId, returnPath, type, addonType, amount, addonId } = body;
      
      return XenditService.createCheckoutSession(
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
          },
        },
      );
    },
    {
      body: CreateXenditCheckoutDto,
      detail: { summary: "Create Xendit Checkout Session", tags: ["Xendit"] },
    },
  )
  .post(
    "/portal",
    async ({ auth, status }) => {
      if (!auth) return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      // Placeholder for now
      return { url: `${process.env.NEXT_PUBLIC_APP_URL}/en/settings/billing` };
    },
    { detail: { summary: "Create Customer Portal", tags: ["Xendit"] } },
  )
  .get(
    "/invoices/:id",
    async ({ params }) => {
      return XenditService.getInvoiceUrl(params.id);
    },
    { detail: { summary: "Get Invoice URL", tags: ["Xendit"] } },
  )
  .post(
    "/cancel-subscription",
    async ({ auth, status }) => {
      if (!auth) return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      return XenditService.cancelSubscription(auth.workspace_id);
    },
    { detail: { summary: "Cancel Subscription", tags: ["Xendit"] } },
  );
