import Stripe from "stripe";
import { db } from "@workspace/database";
import { workspaces, pricing } from "@workspace/database";
import { eq, or } from "drizzle-orm";
import { ErrorCode } from "@workspace/types";
import { buildSuccess, buildError } from "@workspace/utils";
import { status } from "elysia";
import { OrdersService } from "../orders/orders.service";
import { Env } from "@workspace/constants";

const stripe = new Stripe(Env.STRIPE_SECRET_KEY as string);

export abstract class StripeService {
  static async handleWebhook(rawBody: string, signature: string) {
    const webhookSecret = Env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
    }

    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.client_reference_id) {
          const workspaceId = session.client_reference_id;
          const userId = session.metadata?.userId;
          const subscriptionId = session.subscription as string;
          const customerId = session.customer as string;

          if (subscriptionId) {
            const subscription =
              await stripe.subscriptions.retrieve(subscriptionId);
            const priceId = subscription.items.data[0]?.price.id;

            if (priceId) {
              const [plan] = await db
                .select()
                .from(pricing)
                .where(
                  or(
                    eq(pricing.stripe_price_id_monthly, priceId),
                    eq(pricing.stripe_price_id_yearly, priceId),
                  ),
                )
                .limit(1);

              await db
                .update(workspaces)
                .set({
                  stripe_customer_id: customerId,
                  stripe_subscription_id: subscriptionId,
                  plan_id: plan?.id,
                  plan_status: subscription.status,
                  stripe_current_period_end: new Date(
                    (subscription as any).current_period_end * 1000,
                  ),
                  ai_tokens_used: 0,
                  vault_size_used_bytes: 0,
                })
                .where(eq(workspaces.id, workspaceId));
            }
          }
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as any;
        const customerId = invoice.customer as string;
        const [workspace] = await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.stripe_customer_id, customerId))
          .limit(1);

        if (workspace) {
          await OrdersService.createOrderFromStripe({
            workspace_id: workspace.id,
            stripe_invoice_id: invoice.id,
            stripe_subscription_id: invoice.subscription as string,
            stripe_payment_intent_id: invoice.payment_intent as string,
            amount: invoice.amount_paid,
            currency: invoice.currency,
            status: "paid",
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        const customerId = invoice.customer as string;
        const [workspace] = await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.stripe_customer_id, customerId))
          .limit(1);

        if (workspace) {
          await OrdersService.createOrderFromStripe({
            workspace_id: workspace.id,
            stripe_invoice_id: invoice.id,
            stripe_subscription_id: invoice.subscription as string,
            stripe_payment_intent_id: invoice.payment_intent as string,
            amount: invoice.amount_due,
            currency: invoice.currency,
            status: "failed",
          });

          // Also update workspace plan status
          await db
            .update(workspaces)
            .set({ plan_status: "past_due" })
            .where(eq(workspaces.id, workspace.id));
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price.id;

        if (priceId) {
          const [plan] = await db
            .select()
            .from(pricing)
            .where(
              or(
                eq(pricing.stripe_price_id_monthly, priceId),
                eq(pricing.stripe_price_id_yearly, priceId),
              ),
            )
            .limit(1);

          // Whenever a subscription updates (renews, upgrades), reset standard usages if the period rolled over
          await db
            .update(workspaces)
            .set({
              stripe_subscription_id: subscription.id,
              plan_id: plan?.id,
              plan_status: subscription.status,
              stripe_current_period_end: new Date(
                (subscription as any).current_period_end * 1000,
              ),
            })
            .where(eq(workspaces.stripe_customer_id, customerId));
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Downgrade back to Free Tier config
        await db
          .update(workspaces)
          .set({
            plan_status: "free",
            plan_id: null,
            stripe_subscription_id: null,
          })
          .where(eq(workspaces.stripe_customer_id, customerId));
        break;
      }
    }
  }

  static async createCheckoutSession(
    workspaceId: string,
    userId: string,
    priceId: string,
  ) {
    if (!Env.STRIPE_SECRET_KEY) {
      throw status(
        500,
        buildError(ErrorCode.INTERNAL_ERROR, "Stripe is not configured"),
      );
    }

    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Workspace not found"));
    }

    const [plan] = await db
      .select()
      .from(pricing)
      .where(
        or(
          eq(pricing.stripe_price_id_monthly, priceId),
          eq(pricing.stripe_price_id_yearly, priceId),
          eq(pricing.stripe_price_id_one_time, priceId),
        ),
      )
      .limit(1);

    if (!plan) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Plan not found"));
    }

    const appUrl =
      Env.API_BASE_URL?.replace("api.", "") || "http://localhost:3001";

    // Determine mode based on which price ID it is
    const mode =
      priceId === plan.stripe_price_id_one_time ? "payment" : "subscription";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      billing_address_collection: "required",
      customer: workspace.stripe_customer_id || undefined,
      client_reference_id: workspace.id,
      metadata: {
        userId,
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode,
      success_url: `${appUrl}/en/settings/billing?success=true`,
      cancel_url: `${appUrl}/en/settings/billing?canceled=true`,
    });

    return buildSuccess({ url: session.url }, "Checkout session created");
  }

  static async createCustomerPortal(workspaceId: string) {
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });

    if (!workspace || !workspace.stripe_customer_id) {
      throw status(
        400,
        buildError(
          ErrorCode.VALIDATION_ERROR,
          "No active Stripe customer found for this workspace",
        ),
      );
    }

    const appUrl =
      Env.API_BASE_URL?.replace("api.", "") || "http://localhost:3001";

    const session = await stripe.billingPortal.sessions.create({
      customer: workspace.stripe_customer_id,
      return_url: `${appUrl}/en/settings/billing`,
    });

    return buildSuccess({ url: session.url }, "Customer portal created");
  }
}
