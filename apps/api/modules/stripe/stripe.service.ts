import Stripe from "stripe";
import { db } from "@workspace/database";
import { workspaces, pricing } from "@workspace/database";
import { eq, or, and, sql } from "drizzle-orm";
import { ErrorCode } from "@workspace/types";
import { buildSuccess, buildError } from "@workspace/utils";
import { status } from "elysia";
import { OrdersService } from "../orders/orders.service";
import { Env } from "@workspace/constants";
import { user_workspaces, users } from "@workspace/database";

const stripe = new Stripe(Env.STRIPE_SECRET_KEY as string);

export abstract class StripeService {
  static async handleWebhook(rawBody: string, signature: string) {
    const webhookSecret = Env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
    }

    const event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    );

    console.log(`[Stripe Webhook] Received event: ${event.type}`);

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
                    sql`${pricing.prices} @> ${JSON.stringify([{ stripe_monthly_id: priceId }])}::jsonb`,
                    sql`${pricing.prices} @> ${JSON.stringify([{ stripe_yearly_id: priceId }])}::jsonb`,
                  ),
                )
                .limit(1);

              console.log(
                "[Stripe Webhook] Subscription keys:",
                Object.keys(subscription),
              );
              let currentPeriodEnd = (subscription as any).current_period_end;
              if (!currentPeriodEnd && (subscription as any).items?.data?.[0]) {
                currentPeriodEnd = (subscription as any).items.data[0]
                  .current_period_end;
                console.log(
                  "[Stripe Webhook] Found current_period_end in items.data[0]:",
                  currentPeriodEnd,
                );
              }
              console.log(
                "[Stripe Webhook] current_period_end value:",
                currentPeriodEnd,
              );

              await db
                .update(workspaces)
                .set({
                  stripe_customer_id: customerId,
                  stripe_subscription_id: subscriptionId,
                  plan_id: plan?.id,
                  plan_status: subscription.status,
                  stripe_current_period_end: currentPeriodEnd
                    ? new Date(Number(currentPeriodEnd) * 1000)
                    : null,
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
        console.log(`[Stripe Webhook] invoice.paid for customer ${customerId}`);
        console.log(
          `[Stripe Webhook] Invoice details:`,
          JSON.stringify(
            {
              id: invoice.id,
              amount_paid: invoice.amount_paid,
              currency: invoice.currency,
              customer: invoice.customer,
              subscription: invoice.subscription,
            },
            null,
            2,
          ),
        );

        const [workspace] = await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.stripe_customer_id, customerId))
          .limit(1);

        if (workspace) {
          console.log(
            `[Stripe Webhook] Found workspace ${workspace.id} for customer ${customerId}. Creating order...`,
          );

          // Find the owner of the workspace to attribute the order
          const owner = await db
            .select({ id: users.id })
            .from(users)
            .innerJoin(user_workspaces, eq(users.id, user_workspaces.user_id))
            .where(
              and(
                eq(user_workspaces.workspace_id, workspace.id),
                eq(user_workspaces.role, "owner"),
              ),
            )
            .limit(1)
            .then((res) => res[0]);

          const orderResult = await OrdersService.createOrderFromStripe({
            workspace_id: workspace.id,
            user_id: owner?.id,
            stripe_invoice_id: invoice.id,
            stripe_subscription_id: invoice.subscription as string,
            stripe_payment_intent_id: invoice.payment_intent as string,
            amount: invoice.amount_paid,
            currency: invoice.currency,
            status: "paid",
          });
          console.log(
            `[Stripe Webhook] Order creation result:`,
            JSON.stringify(orderResult, null, 2),
          );
        } else {
          console.log(
            `[Stripe Webhook] Workspace not found for customer ${customerId} (Checked stripe_customer_id)`,
          );
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
          // Find the owner of the workspace to attribute the order
          const owner = await db
            .select({ id: users.id })
            .from(users)
            .innerJoin(user_workspaces, eq(users.id, user_workspaces.user_id))
            .where(
              and(
                eq(user_workspaces.workspace_id, workspace.id),
                eq(user_workspaces.role, "owner"),
              ),
            )
            .limit(1)
            .then((res) => res[0]);

          await OrdersService.createOrderFromStripe({
            workspace_id: workspace.id,
            user_id: owner?.id,
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
                sql`${pricing.prices} @> ${JSON.stringify([{ stripe_monthly_id: priceId }])}::jsonb`,
                sql`${pricing.prices} @> ${JSON.stringify([{ stripe_yearly_id: priceId }])}::jsonb`,
              ),
            )
            .limit(1);

          console.log(
            "[Stripe Webhook] Subscription keys:",
            Object.keys(subscription),
          );
          let currentPeriodEnd = (subscription as any).current_period_end;
          if (!currentPeriodEnd && (subscription as any).items?.data?.[0]) {
            currentPeriodEnd = (subscription as any).items.data[0]
              .current_period_end;
            console.log(
              "[Stripe Webhook] Found current_period_end in items.data[0]:",
              currentPeriodEnd,
            );
          }
          console.log(
            "[Stripe Webhook] Resolved current_period_end value:",
            currentPeriodEnd,
          );

          // Whenever a subscription updates (renews, upgrades), reset standard usages if the period rolled over
          await db
            .update(workspaces)
            .set({
              stripe_subscription_id: subscription.id,
              plan_id: plan?.id,
              plan_status: subscription.status,
              stripe_current_period_end: currentPeriodEnd
                ? new Date(Number(currentPeriodEnd) * 1000)
                : null,
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
    returnPath?: string,
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
          sql`${pricing.prices} @> ${JSON.stringify([{ stripe_monthly_id: priceId }])}::jsonb`,
          sql`${pricing.prices} @> ${JSON.stringify([{ stripe_yearly_id: priceId }])}::jsonb`,
        ),
      )
      .limit(1);

    if (!plan) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Plan not found"));
    }

    const appUrl =
      Env.NEXT_PUBLIC_APP_URL ||
      (Env.API_BASE_URL || "http://localhost:3001")
        .replace("api.", "")
        .replace(":3002", ":3001")
        .replace(/\/v1$/, "");

    // Determine mode based on which price ID it is
    const mode = "subscription";

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
      success_url: `${appUrl}${returnPath ?? "/en/settings/billing"}?success=true`,
      cancel_url: `${appUrl}${returnPath ?? "/en/settings/billing"}?canceled=true`,
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
      Env.NEXT_PUBLIC_APP_URL ||
      (Env.API_BASE_URL || "http://localhost:3001")
        .replace("api.", "")
        .replace(":3002", ":3001")
        .replace(/\/v1$/, "");

    const session = await stripe.billingPortal.sessions.create({
      customer: workspace.stripe_customer_id,
      return_url: `${appUrl}/en/settings/billing`,
    });

    return buildSuccess({ url: session.url }, "Customer portal created");
  }
}
