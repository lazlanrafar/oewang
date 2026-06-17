import { timingSafeEqual } from "node:crypto";
import { Env } from "@workspace/constants";
import {
  sendAddonPurchaseSuccessEmail,
  sendInvoiceSentEmail,
  sendPaymentFailedEmail,
  sendPurchaseSuccessEmail,
} from "@workspace/email";
import { logger } from "@workspace/logger";
import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { status } from "elysia";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OrdersService } from "../orders/orders.service";
import { calculatePeriodEnd, inferBillingInterval } from "./billing.utils";
import { BillingInvoicesService } from "./billing-invoices.service";
import { MayarRepository } from "./mayar.repository";

const MAYAR_BASE_URL =
  Env.MAYAR_API_URL ||
  (process.env.NODE_ENV === "development" &&
  !Env.MAYAR_API_KEY?.startsWith("sk_live_")
    ? "https://api.mayar.club/hl/v1"
    : "https://api.mayar.id/hl/v1");

// Payment page base — only production has a public-facing slug URL
const MAYAR_WEB_URL = "https://mayar.id";

// Customer portal — where customers can log in to view/download invoices
const MAYAR_MEMBER_URL = MAYAR_BASE_URL.includes("api.mayar.club")
  ? "https://portal.mayar.club"
  : "https://portal.mayar.id";

export abstract class MayarService {
  private static getAuthHeader() {
    const key = Env.MAYAR_API_KEY;
    if (!key) {
      throw status(
        500,
        buildError(ErrorCode.INTERNAL_ERROR, "Mayar is not configured"),
      );
    }
    return `Bearer ${key}`;
  }

  static async syncWorkspaceInvoices(workspaceId: string, email: string) {
    logger.info("[Mayar] Syncing workspace invoices", { workspaceId, email });
    try {
      const response = await MayarService.mayarRequest(
        "GET",
        "/invoice?pageSize=50",
        undefined,
        "v1",
      );
      if (!response.data || !Array.isArray(response.data)) return false;

      let synced = false;
      for (const invoice of response.data) {
        if (invoice.status === "paid") {
          const meta = MayarService.getMetadata(invoice);
          if (
            meta.workspaceId === workspaceId ||
            invoice.customer?.email === email
          ) {
            // Use invoice.id as the claim key — the same key a real webhook would use.
            // This prevents the same invoice being processed once by webhook and again by sync.
            logger.info("[Mayar] Manually syncing invoice via mock event", {
              invoiceId: invoice.id,
            });
            await MayarService.asyncProcessEvent({
              event: "payment.received",
              _skipNotifications: true,
              data: {
                ...invoice,
                original_id: invoice.id,
                extraData: {
                  ...(invoice.extraData || {}),
                  workspaceId,
                },
              },
            }).catch((err) => {
              logger.error("[Mayar] Sync error processing invoice", err);
            });
            synced = true;
          }
        }
      }
      return synced;
    } catch (error) {
      logger.error("[Mayar] Failed to sync workspace invoices", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private static getEventType(event: any): string | undefined {
    if (!event) return undefined;
    if (typeof event.event === "string") return event.event;
    if (typeof event.event === "object" && event.event?.received)
      return event.event.received;
    return undefined;
  }

  private static isStatusSuccess(data: any): boolean {
    if (!data) return false;
    if (data.status === true) return true;
    if (data.status === "SUCCESS") return true;
    if (data.status === "paid") return true; // Invoice status API
    if (data.transactionStatus === "SUCCESS") return true;
    if (data.payment_status === "PAID") return true; // Checkout status
    if (data.payment_status === "SUCCESS") return true;
    // For payment.reminder etc.
    if (data.status === "created") return false;
    return false;
  }

  private static getMetadata(data: any): any {
    if (!data) return {};
    // Checkout API usually uses 'metadata', Simple API uses 'extraData'
    return data.metadata || data.extraData || {};
  }

  private static async mayarRequest(
    method: string,
    endpoint: string,
    body?: any,
    apiVersion: "v1" | "v2" = "v1",
  ) {
    const baseUrl =
      apiVersion === "v2"
        ? MAYAR_BASE_URL.replace("/v1", "/v2")
        : MAYAR_BASE_URL;

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: MayarService.getAuthHeader(),
      },
      ...(body && method !== "GET" ? { body: JSON.stringify(body) } : {}),
    });

    logger.info(`[Mayar API] Request: ${method} ${baseUrl}${endpoint}`, {
      keyStarts: Env.MAYAR_API_KEY?.substring(0, 10),
      keyLength: Env.MAYAR_API_KEY?.length,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[Mayar API] Request failed: ${response.status}`, {
        errorText,
        endpoint,
        method,
      });
      throw new Error(`Mayar API error ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  /** Constant-time webhook token comparison (avoids timing side-channels). */
  private static tokensMatch(received: string | undefined, expected: string) {
    if (!received) return false;
    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  static async handleWebhook(event: any, receivedToken?: string) {
    // 1. Verify Webhook Token
    const configuredToken = Env.MAYAR_WEBHOOK_TOKEN;
    if (process.env.NODE_ENV === "production" && !configuredToken) {
      logger.error("[Mayar Webhook] Missing MAYAR_WEBHOOK_TOKEN in production");
      throw status(
        500,
        buildError(
          ErrorCode.INTERNAL_ERROR,
          "Webhook configuration is missing",
        ),
      );
    }
    if (
      configuredToken &&
      !MayarService.tokensMatch(receivedToken, configuredToken)
    ) {
      // Never log token material (prefixes/lengths leak the secret over time).
      logger.error("[Mayar Webhook] Unauthorized - Invalid or missing token");
      throw status(
        401,
        buildError(ErrorCode.UNAUTHORIZED, "Invalid webhook token"),
      );
    }

    // 2. Normalize Event Type
    const eventType = MayarService.getEventType(event);

    // 3. Handle 'testing' event early
    if (eventType === "testing") {
      logger.info(
        "[Mayar Webhook] Received testing event, responding with success",
        {
          eventId: event.data?.id,
        },
      );
      return;
    }

    logger.info(`[Mayar Webhook] Received event: ${eventType}`, {
      eventType,
      dataId: event.data?.id,
    });

    try {
      await MayarService.processEvent(event);
    } catch (error) {
      logger.error("[Mayar Webhook] Error processing event", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private static async asyncProcessEvent(event: any) {
    // Sync events reconcile subscription state only — emails are the webhook's job.
    const skipNotifications = !!event._skipNotifications;

    const eventType = MayarService.getEventType(event);

    // Skip processing if it's a testing event
    if (eventType === "testing") return;

    const eventId = event.data?.id;

    if (!eventId) {
      logger.warn(
        "[Mayar Webhook] Could not determine unique eventId. Skipping.",
        { event },
      );
      return;
    }

    // Atomically claim the event — INSERT first, skip if conflict.
    // This prevents duplicate processing when Mayar retries the webhook concurrently.
    const claimed = await MayarRepository.tryClaimEvent(eventId);
    if (!claimed) {
      logger.info(
        "[Mayar Webhook] Event already claimed by another process, skipping",
        { eventId },
      );
      return;
    }

    // payment.received or purchase — customer has completed payment
    const isSuccessEvent =
      (eventType === "payment.received" || eventType === "purchase") &&
      MayarService.isStatusSuccess(event.data);

    if (isSuccessEvent) {
      const data = event.data;
      const customerEmail = data.customerEmail || data.customer?.email;
      const transactionId = data.original_id || data.id;
      const amount = data.amount || data.total_amount;
      const currency = data.currency || "IDR";

      // Parse metadata from flexible sources
      const metadata = MayarService.getMetadata(data);
      const workspaceId = metadata.workspaceId;
      const planId = metadata.planId;
      const paymentType = metadata.type; // "subscription" | "addon"
      const addonId = metadata.addonId;
      const addonQty = Number(metadata.qty) || 1;
      const billing = metadata.billing; // "monthly" | "annual"

      if (!workspaceId) {
        logger.warn(
          "[Mayar Webhook] No workspaceId in extraData, matching by customerEmail",
          {
            customerEmail,
            transactionId,
          },
        );
      }

      const targetWorkspaceId =
        workspaceId ||
        (customerEmail
          ? (await MayarRepository.findWorkspaceByCustomerEmail(customerEmail))
              ?.id
          : undefined);

      if (!targetWorkspaceId) {
        logger.error("[Mayar Webhook] Cannot find workspace for payment", {
          customerEmail,
          transactionId,
        });
        return;
      }

      // 1. Create Order Record — check first so we know if this is a genuinely new purchase
      const isNewOrder = transactionId
        ? !(await OrdersService.orderExistsForInvoice(transactionId))
        : true;

      await OrdersService.createOrder({
        workspace_id: targetWorkspaceId,
        mayar_invoice_id: transactionId,
        amount,
        currency,
        status: "paid",
      });

      // 2. Update customer email on workspace
      await MayarRepository.updateWorkspaceSubscription(targetWorkspaceId, {
        mayar_customer_email: customerEmail || null,
      });

      // 3. Fulfill based on type and matched plan
      const plans = await MayarRepository.findAllPlans();
      let matchedPlan = planId ? plans.find((p) => p.id === planId) : null;

      // If no planId in metadata, or we need to verify type, match by amount
      if (!matchedPlan && amount) {
        matchedPlan = plans.find((p) =>
          p.prices.some(
            (price) =>
              price.monthly === Number(amount) ||
              price.yearly === Number(amount),
          ),
        );
        if (matchedPlan) {
          logger.info(
            `[Mayar Webhook] Matched plan by amount: ${matchedPlan.name} (${matchedPlan.id})`,
          );
        }
      }

      // Determine if we should handle as addon or subscription
      // Priority: 1. Matched plan's is_addon property, 2. metadata.type hint
      const isAddon = matchedPlan
        ? matchedPlan.is_addon
        : paymentType === "addon";

      if (isAddon) {
        const finalAddonId = matchedPlan?.id || addonId;
        if (finalAddonId) {
          logger.info(
            `[Mayar Webhook] Fulfilling addon ${finalAddonId} for workspace ${targetWorkspaceId}`,
          );
          await MayarRepository.upsertWorkspaceAddon({
            workspace_id: targetWorkspaceId,
            addon_id: finalAddonId,
            amount,
            qty: addonQty,
            status: "active",
            mayar_transaction_id: transactionId,
          });

          // Issue internal billing invoice for the add-on payment
          if (isNewOrder && matchedPlan) {
            const workspaceRecordForInvoice =
              await MayarRepository.findWorkspaceById(targetWorkspaceId);
            const unitAmount =
              addonQty > 0
                ? Math.round(Number(amount) / addonQty)
                : Number(amount);
            await BillingInvoicesService.issue({
              workspaceId: targetWorkspaceId,
              workspaceName: workspaceRecordForInvoice?.name,
              billingEmail: customerEmail || null,
              planId: finalAddonId,
              kind: "addon",
              currency: (currency || "IDR").toUpperCase(),
              mayarTransactionId: transactionId,
              paidAt: new Date(),
              lineItems: [
                {
                  description: matchedPlan.name,
                  quantity: addonQty,
                  unit_amount: unitAmount,
                  amount: Number(amount),
                  meta: {
                    addon_id: finalAddonId,
                    addon_type: matchedPlan.addon_type,
                  },
                },
              ],
            }).catch((err) =>
              logger.warn("[Mayar] Failed to issue addon invoice (non-fatal)", {
                err,
              }),
            );
          }

          // Email only from real webhook, only for a new order (not a retry)
          if (!skipNotifications && isNewOrder) {
            const addonOwner =
              await MayarRepository.findWorkspaceOwner(targetWorkspaceId);
            const addonWorkspace =
              await MayarRepository.findWorkspaceById(targetWorkspaceId);
            if (addonOwner?.email && matchedPlan?.name) {
              await sendAddonPurchaseSuccessEmail(
                addonOwner.email,
                addonOwner.name || "there",
                addonWorkspace?.name || "Workspace",
                matchedPlan.name,
              ).catch((err) =>
                logger.warn("[Mayar Webhook] Addon email failed", { err }),
              );
            }
            if (addonOwner?.id && matchedPlan?.name) {
              NotificationsService.create({
                workspace_id: targetWorkspaceId,
                user_id: addonOwner.id,
                type: "subscription.addon_purchased",
                title: "Add-on Activated",
                message: `${matchedPlan.name} has been added to your workspace.`,
                link: "/settings/billing",
              }).catch(() => {});
            }
          }
        } else {
          logger.warn(
            `[Mayar Webhook] Addon payment received but could not match addon ID for amount ${amount}`,
          );
        }
      } else {
        // Handle as subscription
        logger.info(
          `[Mayar Webhook] Updating subscription for workspace ${targetWorkspaceId}`,
        );

        const finalPlanId = matchedPlan?.id || planId;
        const billingInterval = inferBillingInterval({
          billing,
          planId: planId || finalPlanId,
          matchedPlan,
          amount: Number(amount),
        });

        const periodStart = new Date();
        const periodEnd = calculatePeriodEnd(periodStart, billingInterval);

        await MayarRepository.updateWorkspaceSubscription(targetWorkspaceId, {
          plan_id: finalPlanId || null,
          plan_status: "active",
          plan_billing_interval: billingInterval,
          mayar_transaction_id: transactionId,
          mayar_customer_email: customerEmail || null,
          plan_started_at: periodStart,
          plan_current_period_end: periodEnd,
          plan_overdue_started_at: null,
          plan_last_reminder_at: null,
          ai_tokens_used: 0,
          ai_tokens_reset_at: periodStart,
          updated_at: periodStart,
        });

        // Issue internal billing invoice for this subscription payment.
        // Idempotent on mayar_transaction_id — safe if the webhook retries.
        if (isNewOrder && matchedPlan) {
          const workspaceRecordForInvoice =
            await MayarRepository.findWorkspaceById(targetWorkspaceId);
          await BillingInvoicesService.issue({
            workspaceId: targetWorkspaceId,
            workspaceName: workspaceRecordForInvoice?.name,
            billingEmail: customerEmail || null,
            planId: matchedPlan.id,
            billingInterval,
            periodStart,
            periodEnd,
            kind: "subscription",
            currency: (currency || "IDR").toUpperCase(),
            mayarTransactionId: transactionId,
            paidAt: periodStart,
            lineItems: [
              {
                description: `${matchedPlan.name} — ${billingInterval === "annual" ? "Annual" : "Monthly"} subscription`,
                quantity: 1,
                unit_amount: Number(amount),
                amount: Number(amount),
                meta: {
                  plan_id: matchedPlan.id,
                  billing_interval: billingInterval,
                },
              },
            ],
          }).catch((err) =>
            logger.warn("[Mayar] Failed to issue billing invoice (non-fatal)", {
              err,
            }),
          );
        }

        // Email only from real webhook, only for a new order (not a retry)
        if (!skipNotifications && isNewOrder) {
          const owner =
            await MayarRepository.findWorkspaceOwner(targetWorkspaceId);
          const workspaceRecord =
            await MayarRepository.findWorkspaceById(targetWorkspaceId);
          if (owner?.email && matchedPlan?.name) {
            await sendPurchaseSuccessEmail(
              owner.email,
              owner.name || "there",
              workspaceRecord?.name || "Workspace",
              matchedPlan.name,
            );
          }
          if (owner?.id && matchedPlan?.name) {
            NotificationsService.create({
              workspace_id: targetWorkspaceId,
              user_id: owner.id,
              type: "subscription.activated",
              title: "Subscription Activated",
              message: `Your ${matchedPlan.name} plan is now active. Enjoy your upgraded workspace!`,
              link: "/settings/billing",
            }).catch(() => {});
          }
        }
      }
    }

    // payment.failed — mark order as failed, notify workspace owner
    if (eventType === "payment.failed") {
      const data = event.data;
      const transactionId = data?.id;
      if (transactionId) {
        logger.warn("[Mayar Webhook] Payment failed", { transactionId });
        await OrdersService.updateOrderFromInvoiceId(transactionId, "failed");

        // Look up the workspace and notify the owner
        const failedWorkspace =
          await MayarRepository.findWorkspaceByTransactionId(transactionId);
        if (failedWorkspace) {
          const failedOwner = await MayarRepository.findWorkspaceOwner(
            failedWorkspace.id,
          );
          if (failedOwner) {
            await Promise.allSettled([
              NotificationsService.create({
                workspace_id: failedWorkspace.id,
                user_id: failedOwner.id,
                type: "subscription.payment_due",
                title: "Payment failed",
                message:
                  "Your recent payment could not be processed. Please update your payment method to avoid a downgrade.",
                link: "/settings/billing",
              }),
              sendPaymentFailedEmail(
                failedOwner.email,
                failedOwner.name || "there",
                failedWorkspace.name,
              ),
            ]);
          }
        }
      }
    }
  }

  private static async processEvent(event: any) {
    // Run async to avoid blocking Mayar's response time requirement
    MayarService.asyncProcessEvent(event).catch((err) => {
      logger.error("[Mayar Webhook] Async processing error", {
        err,
        eventId: event.data?.id,
      });
    });
  }

  static async createCheckoutSession(
    workspaceId: string,
    userId: string,
    priceId?: string | null,
    returnPath?: string,
    options?: {
      mode?: string;
      metadata?: any;
    },
  ) {
    const workspace = await MayarRepository.findWorkspaceById(workspaceId);
    if (!workspace) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Workspace not found"));
    }

    const appUrl = Env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const owner = await MayarRepository.findWorkspaceOwner(workspaceId);
    let amount = Number(options?.metadata?.amount || 0);
    const qty = Number(options?.metadata?.qty) || 1;
    let resolvedPlan: any = null;

    const isUuid = (id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      );

    // Always resolve plan from priceId — needed for name/description even when amount is known
    if (priceId) {
      const pid = priceId as string;
      const plan = isUuid(pid)
        ? await MayarRepository.findPlanById(pid)
        : await MayarRepository.findPlanByMayarProductId(pid);
      resolvedPlan = plan;

      // Only derive amount from plan when the client didn't supply one
      if (!amount && plan?.prices) {
        const matchingPrice = isUuid(pid)
          ? plan.prices[0]
          : plan.prices.find(
              (p) =>
                p.mayar_monthly_id === pid ||
                p.mayar_yearly_id === pid ||
                p.mayar_product_id === pid,
            );

        if (matchingPrice) {
          const billing = inferBillingInterval({
            billing: options?.metadata?.billing,
            planId: pid,
            matchedPlan: plan as any,
          });
          amount =
            (billing === "annual"
              ? matchingPrice.yearly
              : matchingPrice.monthly) ||
            matchingPrice.monthly ||
            0;
        }
      }
    }

    if (!amount) {
      logger.warn("[Mayar] Could not determine amount for checkout", {
        priceId,
        workspaceId,
      });
      // For standard plans, we shouldn't proceed with 0 amount unless it's explicitly a free plan
      // But free plans should be handled before calling checkout.
    }

    if (!owner?.email) {
      throw status(
        400,
        buildError(
          ErrorCode.VALIDATION_ERROR,
          "Workspace owner email is missing",
        ),
      );
    }

    const resolvedBilling = inferBillingInterval({
      billing: options?.metadata?.billing,
      planId: priceId || null,
      matchedPlan: resolvedPlan,
      amount,
    });

    const isAddonPurchase = !!options?.metadata?.addonId;
    const description = isAddonPurchase
      ? resolvedPlan?.name ||
        (options?.metadata?.addonType === "ai"
          ? "AI Token Add-on"
          : "Storage Add-on")
      : resolvedPlan
        ? `${resolvedPlan.name} – ${resolvedBilling === "annual" ? "Annual" : "Monthly"} Plan`
        : "Oewang Subscription";

    const redirectLocale = options?.metadata?.locale || "en";
    const successUrl = returnPath
      ? `${appUrl}${returnPath.startsWith("/") ? returnPath : `/${returnPath}`}`
      : `${appUrl}/${redirectLocale}/payment/success`;
    const cancelUrl = `${appUrl}/${redirectLocale}/upgrade/failed`;

    try {
      logger.info("[Mayar] Creating checkout session", {
        workspaceId,
        email: owner.email,
        amount,
        type: options?.metadata?.type,
      });

      const payload = {
        name: owner?.name || workspace?.name || "Customer",
        email: owner.email,
        mobile: owner?.mobile || "08123456789",
        redirectUrl: successUrl,
        description: description,
        expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        items: [
          {
            quantity: 1,
            price: amount,
            rate: amount,
            description: description,
          },
        ],
        extraData: {
          workspaceId,
          planId: priceId,
          type: options?.metadata?.addonId
            ? "addon"
            : options?.metadata?.type || "subscription",
          addonId: options?.metadata?.addonId,
          addonType: options?.metadata?.addonType,
          qty: qty > 1 ? String(qty) : undefined,
          billing: resolvedBilling,
          locale: redirectLocale,
        },
      };

      logger.debug("[Mayar] Checkout payload", { payload });

      const response = await MayarService.mayarRequest(
        "POST",
        "/invoice/create",
        payload,
        "v1",
      );

      if (!response.data?.link) {
        throw new Error("No checkout URL returned from Mayar");
      }

      // Update workspace with the initial checkout info
      // This helps with matching if the webhook comes without extraData
      await MayarRepository.updateWorkspaceSubscription(workspaceId, {
        mayar_customer_email: owner.email,
        mayar_transaction_id: response.data.id,
      });

      // Send the invoice/bill email to the owner
      const billingLabel = resolvedBilling === "annual" ? "Annual" : "Monthly";
      const invoiceCurrency = (
        options?.metadata?.currency || "IDR"
      ).toUpperCase();
      const ZERO_DECIMAL_CURRENCIES = new Set([
        "IDR",
        "JPY",
        "KRW",
        "VND",
        "BIF",
        "CLP",
        "GNF",
        "MGA",
        "PYG",
        "RWF",
        "UGX",
        "VUV",
        "XAF",
        "XOF",
        "XPF",
      ]);
      const displayRawAmount = ZERO_DECIMAL_CURRENCIES.has(invoiceCurrency)
        ? amount
        : amount / 100;
      const displayAmount = amount
        ? new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: invoiceCurrency,
            minimumFractionDigits: 0,
          }).format(displayRawAmount)
        : "";
      if (displayAmount) {
        await sendInvoiceSentEmail(
          owner.email,
          owner.name || "there",
          workspace.name,
          resolvedPlan?.name || description,
          billingLabel,
          displayAmount,
          response.data.link,
        ).catch((err) =>
          logger.warn("[Mayar] Invoice email failed (non-fatal)", { err }),
        );
      }

      return buildSuccess(
        { url: response.data.link },
        "Checkout session created",
      );
    } catch (error: any) {
      logger.error("[Mayar] Checkout error", { error: error.message });

      if (
        error.message?.includes("429") ||
        error.message?.includes("Duplicate request")
      ) {
        throw status(
          429,
          buildError(
            ErrorCode.RATE_LIMIT_EXCEEDED,
            "Duplicate request detected. Please wait 1 minute before trying again.",
          ),
        );
      }

      throw status(500, buildError(ErrorCode.INTERNAL_ERROR, error.message));
    }
  }

  static async cancelSubscription(workspaceId: string, userId: string) {
    const workspace = await MayarRepository.findWorkspaceById(workspaceId);

    if (!workspace) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Workspace not found"));
    }

    if (
      workspace.plan_status === "free" ||
      workspace.plan_status === "cancelled"
    ) {
      throw status(
        400,
        buildError(
          ErrorCode.VALIDATION_ERROR,
          "No active subscription to cancel",
        ),
      );
    }

    // Mayar does not have a cancel-subscription API endpoint.
    // We flag the subscription as cancelled; the lifecycle service downgrades
    // to Starter once `plan_current_period_end` passes.
    await MayarRepository.updateWorkspaceSubscription(workspaceId, {
      plan_status: "cancelled",
    });

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "subscription.cancelled",
      entity: "workspace",
      entity_id: workspaceId,
      before: { plan_status: workspace.plan_status },
      after: { plan_status: "cancelled" },
    });

    return buildSuccess(
      {
        status: "cancelled",
        cancels_at: workspace.plan_current_period_end,
      },
      "Subscription will end at the current period",
    );
  }

  static async resumeSubscription(workspaceId: string, userId: string) {
    const workspace = await MayarRepository.findWorkspaceById(workspaceId);

    if (!workspace) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Workspace not found"));
    }

    if (workspace.plan_status !== "cancelled") {
      throw status(
        400,
        buildError(
          ErrorCode.VALIDATION_ERROR,
          "Subscription is not in a cancelled state",
        ),
      );
    }

    // Only allow resume while the paid period is still in the future.
    // After period_end the lifecycle service has already downgraded — user
    // must purchase a new subscription instead.
    const now = new Date();
    if (
      !workspace.plan_current_period_end ||
      new Date(workspace.plan_current_period_end) <= now
    ) {
      throw status(
        400,
        buildError(
          ErrorCode.VALIDATION_ERROR,
          "Subscription has already ended. Please subscribe again.",
        ),
      );
    }

    await MayarRepository.updateWorkspaceSubscription(workspaceId, {
      plan_status: "active",
    });

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "subscription.resumed",
      entity: "workspace",
      entity_id: workspaceId,
      before: { plan_status: "cancelled" },
      after: { plan_status: "active" },
    });

    return buildSuccess(
      { status: "active" },
      "Subscription resumed — you'll be billed again at the next renewal",
    );
  }

  /**
   * Schedule a plan change at the next renewal.
   *
   * Mayar lacks a subscription primitive so we model this as a "pending switch":
   * the workspace stays on its current plan until `plan_current_period_end`,
   * then `BillingLifecycleService` (or the next `payment.received` webhook for
   * the new plan) swaps `pending_plan_id` into `plan_id`.
   *
   * - Switching to a free plan: the lifecycle service handles the downgrade
   *   exactly like a cancellation — except the target is the chosen plan instead
   *   of Starter.
   * - Switching to a paid plan: user is sent to checkout for the new plan when
   *   the renewal would have fired. Until then, current plan stays active.
   */
  static async schedulePlanSwitch(
    workspaceId: string,
    userId: string,
    targetPlanId: string,
    targetBillingInterval: "monthly" | "annual",
  ) {
    const workspace = await MayarRepository.findWorkspaceById(workspaceId);

    if (!workspace) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Workspace not found"));
    }

    if (workspace.plan_id === targetPlanId) {
      // Same plan — could still be a billing-interval switch
      if (
        workspace.plan_billing_interval === targetBillingInterval &&
        !workspace.pending_plan_id
      ) {
        throw status(
          400,
          buildError(
            ErrorCode.VALIDATION_ERROR,
            "Already on this plan and billing interval",
          ),
        );
      }
    }

    const targetPlan = await MayarRepository.findPlanById(targetPlanId);
    if (!targetPlan) {
      throw status(
        404,
        buildError(ErrorCode.NOT_FOUND, "Target plan not found"),
      );
    }

    await MayarRepository.updateWorkspaceSubscription(workspaceId, {
      pending_plan_id: targetPlanId,
      pending_plan_billing_interval: targetBillingInterval,
    });

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "subscription.plan_switch_scheduled",
      entity: "workspace",
      entity_id: workspaceId,
      before: {
        plan_id: workspace.plan_id,
        plan_billing_interval: workspace.plan_billing_interval,
      },
      after: {
        pending_plan_id: targetPlanId,
        pending_plan_billing_interval: targetBillingInterval,
      },
    });

    return buildSuccess(
      {
        pending_plan_id: targetPlanId,
        pending_plan_billing_interval: targetBillingInterval,
        switches_at: workspace.plan_current_period_end,
        target_plan_name: targetPlan.name,
      },
      `Plan change scheduled — you'll switch to ${targetPlan.name} on ${workspace.plan_current_period_end ? new Date(workspace.plan_current_period_end).toLocaleDateString() : "the next renewal"}`,
    );
  }

  static async cancelPendingPlanSwitch(workspaceId: string, userId: string) {
    const workspace = await MayarRepository.findWorkspaceById(workspaceId);

    if (!workspace) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Workspace not found"));
    }

    if (!workspace.pending_plan_id) {
      throw status(
        400,
        buildError(
          ErrorCode.VALIDATION_ERROR,
          "No pending plan switch to cancel",
        ),
      );
    }

    await MayarRepository.updateWorkspaceSubscription(workspaceId, {
      pending_plan_id: null,
      pending_plan_billing_interval: null,
    });

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "subscription.plan_switch_cancelled",
      entity: "workspace",
      entity_id: workspaceId,
      before: {
        pending_plan_id: workspace.pending_plan_id,
        pending_plan_billing_interval: workspace.pending_plan_billing_interval,
      },
    });

    return buildSuccess(
      { pending_plan_id: null },
      "Pending plan change cancelled — staying on current plan",
    );
  }

  static async sendCustomerPortalMagicLink(email: string) {
    if (!email) {
      throw status(
        400,
        buildError(ErrorCode.VALIDATION_ERROR, "Customer email is required"),
      );
    }

    try {
      const response = await MayarService.mayarRequest(
        "POST",
        "/customer/login/portal",
        { email },
        "v1",
      );

      return buildSuccess(
        response,
        "A secure access link has been sent to your email",
      );
    } catch (error) {
      logger.error("[Mayar] Failed to send customer portal magic link", {
        email,
        error: error instanceof Error ? error.message : String(error),
      });

      throw status(
        500,
        buildError(
          ErrorCode.INTERNAL_ERROR,
          "Failed to send portal link. Please try again later.",
        ),
      );
    }
  }

  static async createCustomerPortal(_email?: string) {
    return buildSuccess(
      { url: MAYAR_MEMBER_URL },
      "Customer portal URL retrieved",
    );
  }

  private static toAbsoluteUrl(link: string): string {
    if (!link) return MAYAR_MEMBER_URL;
    if (link.startsWith("http://") || link.startsWith("https://")) return link;
    return `${MAYAR_WEB_URL}/${link.replace(/^\//, "")}`;
  }

  static async getInvoiceUrl(invoiceId: string) {
    // 1. Try direct lookup by ID
    try {
      const response = await MayarService.mayarRequest(
        "GET",
        `/invoice/${invoiceId}`,
        undefined,
        "v1",
      );
      const link = response.data?.link ?? response.link;
      logger.info("[Mayar] Direct invoice lookup", {
        invoiceId,
        rawLink: link,
        responseKeys: Object.keys(response.data || response || {}),
      });
      if (link)
        return buildSuccess(
          { url: MayarService.toAbsoluteUrl(link) },
          "Invoice URL retrieved",
        );
    } catch (err) {
      logger.warn("[Mayar] Direct invoice lookup failed", {
        invoiceId,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    // 2. Scan the invoice list (handles cases where direct GET isn't supported)
    try {
      const response = await MayarService.mayarRequest(
        "GET",
        "/invoice?pageSize=100",
        undefined,
        "v1",
      );
      if (Array.isArray(response.data)) {
        const invoice = response.data.find((inv: any) => inv.id === invoiceId);
        logger.info("[Mayar] Invoice list scan", {
          invoiceId,
          found: !!invoice,
          rawLink: invoice?.link,
        });
        if (invoice?.link)
          return buildSuccess(
            { url: MayarService.toAbsoluteUrl(invoice.link) },
            "Invoice URL retrieved",
          );
      }
    } catch (error) {
      logger.warn(
        "[Mayar] Failed to fetch invoice link, falling back to member portal",
        {
          invoiceId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }

    // 3. Last resort: member portal
    return buildSuccess({ url: MAYAR_MEMBER_URL }, "Invoice URL retrieved");
  }

  static async cancelAddon(
    workspaceId: string,
    addonId: string,
    userId: string,
  ) {
    const addon = await MayarRepository.findAddon(workspaceId, addonId);

    if (!addon) {
      throw status(
        404,
        buildError(ErrorCode.NOT_FOUND, "Addon not found for this workspace"),
      );
    }

    await MayarRepository.updateAddonStatus(workspaceId, addonId, "cancelled");

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "addon.cancelled",
      entity: "addon",
      entity_id: addonId,
      before: { status: "active" },
      after: { status: "cancelled" },
    });

    return buildSuccess(
      { status: "cancelled" },
      "Addon scheduled for deactivation at the end of the billing cycle",
    );
  }
}
