import {
  sendPurchaseSuccessEmail,
} from "@workspace/email";
import {
  db,
  pricing,
  workspaces,
  eq,
} from "@workspace/database";
import { Env } from "@workspace/constants";
import { logger } from "@workspace/logger";
import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { status } from "elysia";
import { XenditRepository } from "./xendit.repository";
import { OrdersService } from "../orders/orders.service";
import crypto from "crypto";

export abstract class XenditService {
  private static getAuthHeader() {
    const key = Env.XENDIT_SECRET_KEY;
    if (!key) {
       throw status(500, buildError(ErrorCode.INTERNAL_ERROR, "Xendit is not configured"));
    }
    return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
  }

  private static async xenditRequest(method: string, endpoint: string, body?: any) {
    const response = await fetch(`https://api.xendit.co${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": this.getAuthHeader(),
      },
      ...((body && method !== "GET") ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[Xendit API] Request failed: ${response.status}`, { errorText, endpoint });
      throw new Error(`Xendit API error: ${response.status}`);
    }

    return response.json();
  }

  static async handleWebhook(event: any, callbackTokenHeader: string) {
    const callbackToken = Env.XENDIT_CALLBACK_TOKEN;
    if (!callbackToken) {
      logger.error("[Xendit Webhook] XENDIT_CALLBACK_TOKEN is not configured");
       throw status(500, buildError(ErrorCode.INTERNAL_ERROR, "Webhook verification failed"));
    }

    if (callbackTokenHeader !== callbackToken) {
      logger.error("[Xendit Webhook] Invalid callback token");
      throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Invalid callback token"));
    }
    
    logger.info(`[Xendit Webhook] Received event`, {
      eventId: event.id || event.external_id,
      status: event.status,
    });

    try {
      await XenditService.processEvent(event);
    } catch (error) {
      logger.error("[Xendit Webhook] Error processing event", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private static async asyncProcessEvent(event: any) {
    const eventId = event.id || event.external_id || (event.data?.id) || (event.data?.recurring_payment_id);
    
    if (!eventId) {
      logger.warn("[Xendit Webhook] Could not determine unique eventId for tracking. Skipping duplicate check.", { event });
      // We still try to process it if it's not a tracking check failure, 
      // but isEventProcessed requires a valid string.
    } else {
      if (await XenditRepository.isEventProcessed(eventId)) {
        logger.info("[Xendit Webhook] Event already processed, skipping", { eventId });
        return;
      }
    }

    // Invoices are used for both initial subscriptions and one-off addons
    if (event.status === "PAID" || event.status === "SETTLED") {
      const externalId = event.external_id;
      if (!externalId) return;

      const [workspaceId, type, id, timestamp] = externalId.split(":");
      const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

      // 1. Create Order Record
      await OrdersService.createOrder({
        workspace_id: workspaceId,
        xendit_invoice_id: event.id,
        amount: event.amount,
        currency: event.currency,
        status: "paid",
      });

      // 2. Fulfill based on type
      if (type === "addon") {
        logger.info(`[Xendit Webhook] Fulfilling addon ${id} for workspace ${workspaceId}`);
        
        let addonUuid = id;
        if (!isUuid(id)) {
          const plan = await XenditRepository.findPlanByXenditProductId(id);
          if (plan) {
            addonUuid = plan.id;
          } else {
             logger.error(`[Xendit Webhook] Could not find addon plan for Xendit ID: ${id}`);
             return;
          }
        }

        await XenditRepository.upsertWorkspaceAddon({
          workspace_id: workspaceId,
          addon_id: addonUuid,
          amount: event.amount,
          status: "active",
          xendit_subscription_id: event.id, // Using invoice ID as unique instance ID for one-offs
        });
      }

      if (type === "subscription") {
        logger.info(`[Xendit Webhook] Updating subscription for workspace ${workspaceId} to plan ${id}`);
        
        let planUuid = id;
        if (!isUuid(id)) {
          const plan = await XenditRepository.findPlanByXenditProductId(id);
          if (plan) {
            planUuid = plan.id;
          } else {
            logger.error(`[Xendit Webhook] Could not find subscription plan for Xendit ID: ${id}`);
            return;
          }
        }

        await XenditRepository.updateWorkspaceSubscription(workspaceId, {
          plan_id: planUuid,
          plan_status: "active",
          xendit_customer_id: event.customer_id || null, // Might not be here yet for first payment
        });
      }
    }

    // Recurring payments (direct from Recurring API)
    if (event.event === "recurring.paid" || event.event === "recurring_payment_paid") {
      const data = event.data || event;
      const xenditSubscriptionId = data.recurring_payment_id || data.id;
      const workspace = await XenditRepository.findWorkspaceBySubscriptionId(xenditSubscriptionId);
      
      if (workspace) {
        await OrdersService.createOrder({
          workspace_id: workspace.id,
          xendit_subscription_id: xenditSubscriptionId,
          xendit_invoice_id: data.invoice_id || data.id,
          amount: data.amount,
          currency: data.currency,
          status: "paid",
        });

        await XenditRepository.updateWorkspaceSubscription(workspace.id, {
          plan_status: "active",
        });
      }
    }

    await XenditRepository.markEventProcessed(eventId);
  }

  private static async processEvent(event: any) {
    // Run async to avoid blocking Xendit's response time requirement (sentry/monitoring)
    this.asyncProcessEvent(event).catch(err => {
      logger.error("[Xendit Webhook] Async processing error", { err, eventId: event.id });
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
    // SECURITY: Disable checkout while payment gateway is not yet approved
    return buildError(
      ErrorCode.PAYMENT_GATEWAY_NOT_READY,
      "Checkout is temporarily disabled while we await payment gateway approval. Please try again later.",
      "UNPROCESSABLE_ENTITY", // status 422
    );

    const workspace = await XenditRepository.findWorkspaceById(workspaceId);
    if (!workspace) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Workspace not found"));
    }

    const appUrl = Env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const owner = await XenditRepository.findWorkspaceOwner(workspaceId);
    let amount = Number(options?.metadata?.amount || 0);

    // Regex to validate UUID format
    const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

    // If amount is missing, try to fetch it from the database based on priceId
    if (!amount && priceId) {
      const pid = priceId as string;
      
      // 1. Try to find by UUID (if priceId is a UUID)
      if (isUuid(pid)) {
        const plan = await XenditRepository.findPlanById(pid);
        if (plan) {
          // Add logic if needed
        }
      }

      // 2. Try to find the plan by Xendit price ID (this is the most common case for fixed plans)
      const planByXenditId = await XenditRepository.findPlanByXenditProductId(pid);
      if (planByXenditId) {
        const matchingPrice = planByXenditId!.prices.find(
          (p) => p.xendit_monthly_id === pid || p.xendit_yearly_id === pid || p.xendit_product_id === pid
        );
        if (matchingPrice) {
          amount = matchingPrice!.xendit_monthly_id === pid ? (matchingPrice!.monthly || 0) : 
                   matchingPrice!.xendit_yearly_id === pid ? (matchingPrice!.yearly || 0) : 
                   (matchingPrice!.monthly || 0);
        }
      }
    }

    if (!amount) {
      logger.warn("[Xendit] Could not determine amount for checkout", { priceId, workspaceId });
    }

    const description = `Payment for ${workspace?.name || "Workspace"}`;

    try {
      // If it's a one-off payment (addon)
      if (options?.metadata?.type === "payment") {
        const payload = {
          external_id: `${workspaceId}:addon:${options?.metadata?.addonId || 'unknown'}:${Date.now()}`,
          amount,
          description,
          customer: {
            given_names: workspace?.name || "Customer",
            email: owner?.email,
            mobile_number: owner?.mobile,
          },
          success_redirect_url: `${appUrl}${returnPath ?? "/en/settings/billing"}?success=true`,
          failure_redirect_url: `${appUrl}${returnPath ?? "/en/settings/billing"}?success=false`,
          items: [
            {
              name: options?.metadata?.addonType === "ai" ? "AI Tokens Addon" : "Vault Storage Addon",
              quantity: 1,
              price: amount,
            },
          ],
        };

        const response = await this.xenditRequest("POST", "/v2/invoices", payload);
        return buildSuccess({ url: response.invoice_url }, "Checkout session created");
      }

      // If it's a subscription
      if (options?.metadata?.type === "subscription") {
        const payload = {
          external_id: `${workspaceId}:subscription:${priceId || 'unknown'}:${Date.now()}`,
          amount,
          description: `Subscription Plan for ${workspace?.name || "Workspace"}`,
          customer: {
            given_names: workspace?.name || "Customer",
            email: owner?.email,
          },
          success_redirect_url: `${appUrl}${returnPath ?? "/en/settings/billing"}?success=true`,
        };

        const response = await this.xenditRequest("POST", "/v2/invoices", payload);
        return buildSuccess({ url: response.invoice_url }, "Subscription checkout started");
      }

      throw new Error(`Unsupported checkout type: ${options?.metadata?.type || 'missing'}`);
    } catch (error: any) {
      logger.error("[Xendit] Checkout error", {
        error: error.message,
      });
      throw status(500, buildError(ErrorCode.INTERNAL_ERROR, error.message));
    }
  }

  static async cancelSubscription(workspaceId: string) {
    const workspace = await XenditRepository.findWorkspaceById(workspaceId);

    if (!workspace) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Workspace not found"));
    }

    if (!workspace.xendit_subscription_id) {
      throw status(
        400,
        buildError(ErrorCode.VALIDATION_ERROR, "No active subscription found"),
      );
    }

    // Call Xendit to deactivate recurring plan
    await this.xenditRequest("POST", `/recurring/plans/${workspace.xendit_subscription_id}/deactivate`);

    return buildSuccess(
      { status: "cancelled" },
      "Subscription set to cancel"
    );
  }

  static async getInvoiceUrl(invoiceId: string) {
    // Return Xendit invoice lookup
    return buildSuccess(
      { url: `https://checkout.xendit.co/web/${invoiceId}` },
      "Invoice URL retrieved",
    );
  }
}
