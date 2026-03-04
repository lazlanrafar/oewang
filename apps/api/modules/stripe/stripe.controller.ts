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
        console.error("[Stripe Webhook Error]", err.message);
        set.status = 400;
      }
    },
    { detail: { summary: "Stripe Webhook", tags: ["Stripe"] } },
  )
  .use(authPlugin)
  .use(encryptionPlugin)
  .post(
    "/checkout",
    async ({ body, auth }) => {
      if (!auth?.workspace_id) throw new Error("Unauthorized");
      // @ts-ignore
      return StripeService.createCheckoutSession(
        auth.workspace_id,
        auth.user_id,
        body.priceId,
      );
    },
    {
      body: t.Object({
        priceId: t.String(),
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
  );
