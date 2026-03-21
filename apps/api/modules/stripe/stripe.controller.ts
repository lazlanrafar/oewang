import { Elysia } from "elysia";
import { StripeService } from "./stripe.service";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { t } from "elysia";

export const stripeController = new Elysia({
  prefix: "/stripe",
  name: "stripe.controller",
})
  .post(
    "/webhook",
    async ({ request, set }) => {
      // Stripe requires the raw request body to verify signatures.
      const signature = request.headers.get("stripe-signature");
      if (!signature) {
        set.status = 400;
        return "Missing stripe-signature header";
      }

      const payloadString = await request.text();

      try {
        await StripeService.handleWebhook(payloadString, signature);
        return { received: true };
      } catch (err: any) {
        console.error("[Stripe Webhook Error]", err.stack || err.message);
        set.status = 400;
        return { error: err.message };
      }
    },
    { detail: { summary: "Stripe Webhook", tags: ["Stripe"] } },
  )
  .use(authPlugin)
  .use(encryptionPlugin)
  .post(
    "/checkout",
    async ({ body, auth }) => {
      if (!auth?.user_id) throw new Error("Unauthorized");

      // Use workspaceId from body (onboarding flow) or fallback to auth context (existing workspace)
      const workspaceId = body.workspaceId || auth.workspace_id;
      if (!workspaceId) throw new Error("Workspace context missing");

      // @ts-ignore
      return StripeService.createCheckoutSession(
        workspaceId,
        auth.user_id,
        body.priceId,
        body.returnPath,
      );
    },
    {
      body: t.Object({
        priceId: t.String(),
        workspaceId: t.Optional(t.String()),
        returnPath: t.Optional(t.String()),
      }),
      detail: { summary: "Create Checkout Session", tags: ["Stripe"] },
    },
  )
  .post(
    "/portal",
    async ({ auth }) => {
      if (!auth?.workspace_id) throw new Error("Unauthorized");
      return StripeService.createCustomerPortal(auth.workspace_id);
    },
    { detail: { summary: "Create Customer Portal", tags: ["Stripe"] } },
  )
  .get(
    "/invoices/:id",
    async ({ params }) => {
      return StripeService.getInvoiceUrl(params.id);
    },
    { detail: { summary: "Get Invoice URL", tags: ["Stripe"] } },
  )
  .post(
    "/cancel-subscription",
    async ({ auth }) => {
      if (!auth?.workspace_id) throw new Error("Unauthorized");
      return StripeService.cancelSubscription(auth.workspace_id);
    },
    { detail: { summary: "Cancel Subscription", tags: ["Stripe"] } },
  );
