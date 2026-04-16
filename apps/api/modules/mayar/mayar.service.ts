import { sendPurchaseSuccessEmail } from "@workspace/email";
import { Env } from "@workspace/constants";
import { logger } from "@workspace/logger";
import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { status } from "elysia";
import { MayarRepository } from "./mayar.repository";
import { OrdersService } from "../orders/orders.service";

const MAYAR_BASE_URL = "https://api.mayar.id/hl/v1";

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

  private static async mayarRequest(
    method: string,
    endpoint: string,
    body?: any,
  ) {
    const response = await fetch(`${MAYAR_BASE_URL}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: MayarService.getAuthHeader(),
      },
      ...(body && method !== "GET" ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[Mayar API] Request failed: ${response.status}`, {
        errorText,
        endpoint,
      });
      throw new Error(`Mayar API error: ${response.status}`);
    }

    return response.json();
  }

  static async handleWebhook(event: any, receivedToken?: string) {
    // 1. Verify Webhook Token
    const configuredToken = Env.MAYAR_WEBHOOK_TOKEN;
    if (configuredToken && receivedToken !== configuredToken) {
      logger.error("[Mayar Webhook] Unauthorized - Invalid or missing token", {
        received: !!receivedToken,
      });
      throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Invalid webhook token"));
    }

    logger.info(`[Mayar Webhook] Received event`, {
      eventReceived: event.event?.received,
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

    // payment.received — customer has completed payment
    if (
      event.event?.received === "payment.received" &&
      event.data?.status === true
    ) {
      const data = event.data;
      const customerEmail = data.customerEmail;
      const transactionId = data.id;
      const amount = data.amount;
      const currency = "IDR"; // Mayar is IDR-based by default

      // Parse external reference from extraData if available
      const extraData = data.extraData || {};
      const workspaceId = extraData.workspaceId;
      const paymentType = extraData.type; // "subscription" | "addon"
      const addonId = extraData.addonId;
      const billing = extraData.billing; // "monthly" | "annual"

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

      // 3. Fulfill based on type
      if (paymentType === "addon" && addonId) {
        logger.info(
          `[Mayar Webhook] Fulfilling addon ${addonId} for workspace ${targetWorkspaceId}`,
        );
        await MayarRepository.upsertWorkspaceAddon({
          workspace_id: targetWorkspaceId,
          addon_id: addonId,
          amount,
          status: "active",
          mayar_transaction_id: transactionId,
        });
      }

      if (paymentType === "subscription" || !paymentType) {
        logger.info(
          `[Mayar Webhook] Updating subscription for workspace ${targetWorkspaceId}`,
        );
        // Calculate proper period end: 30 days for monthly, 365 for annual
        const periodDays = billing === "annual" ? 365 : 30;
        const periodEnd = new Date();
        periodEnd.setDate(periodEnd.getDate() + periodDays);

        await MayarRepository.updateWorkspaceSubscription(targetWorkspaceId, {
          plan_status: "active",
          mayar_transaction_id: transactionId,
          mayar_customer_email: customerEmail || null,
          plan_current_period_end: periodEnd,
        });
      }
    }

    // payment.failed — mark order as failed
    if (event.event?.received === "payment.failed") {
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

    const isUuid = (id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      );

    // Resolve amount from DB plan if not provided
    if (!amount && priceId) {
      const pid = priceId as string;
      if (isUuid(pid)) {
        const plan = await MayarRepository.findPlanById(pid);
        // amount from plan can be set if needed
      }
      const planByMayarId = await MayarRepository.findPlanByMayarProductId(pid);
      const prices = planByMayarId?.prices;
      if (prices) {
        const matchingPrice = prices.find(
          (p) =>
            p.mayar_monthly_id === pid ||
            p.mayar_yearly_id === pid ||
            p.mayar_product_id === pid,
        );
        if (matchingPrice) {
          amount =
            matchingPrice.mayar_monthly_id === pid
              ? matchingPrice.monthly || 0
              : matchingPrice.mayar_yearly_id === pid
                ? matchingPrice.yearly || 0
                : matchingPrice.monthly || 0;
        }
      }
    }

    if (!amount) {
      logger.warn("[Mayar] Could not determine amount for checkout", {
        priceId,
        workspaceId,
      });
    }

    const description =
      options?.metadata?.type === "addon"
        ? options?.metadata?.addonType === "ai"
          ? "AI Tokens Addon"
          : "Vault Storage Addon"
        : `Subscription for ${workspace?.name || "Workspace"}`;

    const redirectUrl = `${appUrl}${returnPath ?? "/en/settings/billing"}`;

    try {
      const payload = {
        name: workspace?.name || "Customer",
        email: owner?.email,
        amount,
        mobile: owner?.mobile || undefined,
        redirectUrl,
        description,
        extraData: {
          workspaceId,
          type: options?.metadata?.type || "subscription",
          addonId: options?.metadata?.addonId,
          addonType: options?.metadata?.addonType,
          billing: options?.metadata?.billing || "monthly",
        },
      };

      const response = await MayarService.mayarRequest(
        "POST",
        "/payment/create",
        payload,
      );

      if (!response.data?.link) {
        throw new Error("No checkout URL returned from Mayar");
      }

      return buildSuccess(
        { url: response.data.link },
        "Checkout session created",
      );
    } catch (error: any) {
      logger.error("[Mayar] Checkout error", { error: error.message });
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

  static async getInvoiceUrl(transactionId: string) {
    // Return Mayar transaction lookup URL
    return buildSuccess(
      { url: `https://web.mayar.id/transactions/${transactionId}` },
      "Invoice URL retrieved",
    );
  }
}
