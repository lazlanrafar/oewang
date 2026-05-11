import { sendPurchaseSuccessEmail } from "@workspace/email";
import { Env } from "@workspace/constants";
import { logger } from "@workspace/logger";
import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { status } from "elysia";
import { MayarRepository } from "./mayar.repository";
import { OrdersService } from "../orders/orders.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { calculatePeriodEnd, inferBillingInterval } from "./billing.utils";

const MAYAR_BASE_URL =
  Env.MAYAR_API_URL ||
  (process.env.NODE_ENV === "development" && !Env.MAYAR_API_KEY?.startsWith("sk_live_")
    ? "https://api.mayar.club/hl/v1"
    : "https://api.mayar.id/hl/v1");

const MAYAR_WEB_URL =
  MAYAR_BASE_URL.includes("api.mayar.club")
    ? "https://web.mayar.club"
    : "https://web.mayar.id";

const MAYAR_MEMBER_URL =
  MAYAR_BASE_URL.includes("api.mayar.club")
    ? "https://member.mayar.club"
    : "https://member.mayar.id";

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
      const response = await this.mayarRequest(
        "GET",
        "/invoice?pageSize=50",
        undefined,
        "v1",
      );
      if (!response.data || !Array.isArray(response.data)) return false;

      let synced = false;
      for (const invoice of response.data) {
        if (invoice.status === "paid") {
          const meta = this.getMetadata(invoice);
          if (
            meta.workspaceId === workspaceId ||
            invoice.customer?.email === email
          ) {
            // Generate a deterministic event ID out of the invoice so we don't repeat this
            const eventId = `v5_sync_${invoice.id}`;
            const isProcessed = await MayarRepository.isEventProcessed(eventId);
            if (!isProcessed) {
              logger.info("[Mayar] Manually syncing invoice via mock event", {
                invoiceId: invoice.id,
              });
              await this.asyncProcessEvent({
                event: "payment.received",
                data: {
                  ...invoice,
                  id: eventId, // Pass the deterministic event ID to the webhook processor
                  original_id: invoice.id,
                  // Explicitly inject workspaceId in case it's missing in the list view response
                  // Do NOT override type — preserve what's in extraData so addons are handled correctly
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
    if (configuredToken && receivedToken !== configuredToken) {
      logger.error("[Mayar Webhook] Unauthorized - Invalid or missing token", {
        receivedLen: receivedToken?.length,
        configuredLen: configuredToken?.length,
        receivedStart: receivedToken?.substring(0, 5),
        configuredStart: configuredToken?.substring(0, 5),
      });
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

    if (await MayarRepository.isEventProcessed(eventId)) {
      logger.info("[Mayar Webhook] Event already processed, skipping", {
        eventId,
      });
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
        await MayarRepository.markEventProcessed(eventId);
        return;
      }

      // 1. Create Order Record
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
            status: "active",
            mayar_transaction_id: transactionId,
          });
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

        const owner = await MayarRepository.findWorkspaceOwner(targetWorkspaceId);
        const workspaceRecord = await MayarRepository.findWorkspaceById(
          targetWorkspaceId,
        );
        if (owner?.email && matchedPlan?.name) {
          await sendPurchaseSuccessEmail(
            owner.email,
            owner.name || "there",
            workspaceRecord?.name || "Workspace",
            matchedPlan.name,
          );
        }
      }
    }

    // payment.failed — mark order as failed
    if (eventType === "payment.failed") {
      const data = event.data;
      const transactionId = data?.id;
      if (transactionId) {
        logger.warn("[Mayar Webhook] Payment failed", { transactionId });
        await OrdersService.updateOrderFromInvoiceId(transactionId, "failed");
      }
    }

    await MayarRepository.markEventProcessed(eventId);
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
    let resolvedPlan: any = null;

    const isUuid = (id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      );

    // Resolve amount from DB plan if not provided
    if (!amount && priceId) {
      const pid = priceId as string;
      const plan = isUuid(pid)
        ? await MayarRepository.findPlanById(pid)
        : await MayarRepository.findPlanByMayarProductId(pid);
      resolvedPlan = plan;

      const prices = plan?.prices;
      if (prices) {
        const matchingPrice = isUuid(pid)
          ? prices[0] // Default to first price if internal ID used
          : prices.find(
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

    const description =
      options?.metadata?.type === "addon"
        ? options?.metadata?.addonType === "ai"
          ? "AI Tokens Addon"
          : "Vault Storage Addon"
        : `Subscription for ${workspace?.name || "Workspace"}`;

    const redirectLocale = options?.metadata?.locale || "en";
    const successUrl = `${appUrl}/${redirectLocale}/payment/success`;
    const cancelUrl = `${appUrl}/${redirectLocale}/upgrade/failed`;

    try {
      logger.info("[Mayar] Creating checkout session", {
        workspaceId,
        email: owner.email,
        amount,
        type: options?.metadata?.type,
      });

      const payload = {
        name: workspace?.name || "Customer",
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
          type: options?.metadata?.type || "subscription",
          addonId: options?.metadata?.addonId,
          addonType: options?.metadata?.addonType,
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

  static async cancelSubscription(workspaceId: string) {
    const workspace = await MayarRepository.findWorkspaceById(workspaceId);

    if (!workspace) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Workspace not found"));
    }

    if (!workspace.mayar_transaction_id) {
      throw status(
        400,
        buildError(ErrorCode.VALIDATION_ERROR, "No active subscription found"),
      );
    }

    // Mayar does not have a cancel subscription API endpoint.
    // We mark the subscription as cancelled in our DB and it will expire naturally.
    await MayarRepository.updateWorkspaceSubscription(workspaceId, {
      plan_status: "cancelled",
    });

    return buildSuccess(
      { status: "cancelled" },
      "Subscription set to cancel at period end",
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
      const response = await this.mayarRequest(
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

  static async createCustomerPortal(email?: string) {
    // Mayar doesn't have a direct portal API, we redirect to their member portal
    // Appendix of email helps the user log in faster
    const url = email ? `${MAYAR_MEMBER_URL}/login?email=${encodeURIComponent(email)}` : MAYAR_MEMBER_URL;
    return buildSuccess(
      { url },
      "Customer portal URL retrieved",
    );
  }

  static async getInvoiceUrl(transactionId: string) {
    // If it's a UUID, it's likely a checkout ID or transaction detail ID
    // If it starts with inv_, it's an invoice ID
    const path = transactionId.startsWith("inv_") ? "invoice" : "transactions";

    return buildSuccess(
      { url: `${MAYAR_WEB_URL}/${path}/${transactionId}` },
      "Invoice URL retrieved",
    );
  }

  static async cancelAddon(workspaceId: string, addonId: string, userId: string) {
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
