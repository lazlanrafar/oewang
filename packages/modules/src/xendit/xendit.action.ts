"use server";

import { axiosInstance as api } from "../lib/axios.server";
import type { ActionResponse } from "@workspace/types";

/**
 * Xendit actions — REST wrappers for Xendit endpoints.
 */

export const createCheckoutSession = async (
  priceId?: string | null,
  workspaceId?: string,
  returnPath?: string,
  type?: "subscription" | "payment",
  addonType?: "ai" | "vault",
  amount?: number,
  addonId?: string,
): Promise<ActionResponse<{ url: string }>> => {
  try {
    const response = await api.post("/xendit/checkout", {
      priceId,
      workspaceId,
      returnPath,
      type,
      addonType,
      amount,
      addonId,
    });
    return {
      success: true,
      data: response.data.data,
    };
  } catch (error: any) {
    return {
      success: false,
      error:
        error.response?.data?.message || "Failed to create checkout session",
    };
  }
};

export const createCustomerPortal = async (): Promise<
  ActionResponse<{ url: string }>
> => {
  try {
    const response = await api.post("/xendit/portal");
    return {
      success: true,
      data: response.data.data,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to open customer portal",
    };
  }
};

export const cancelSubscription = async (): Promise<ActionResponse<any>> => {
  try {
    const response = await api.post("/xendit/cancel-subscription");
    return {
      success: true,
      data: response.data.data,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to cancel subscription",
    };
  }
};

export const getInvoiceUrl = async (
  invoiceId: string,
): Promise<ActionResponse<{ url: string }>> => {
  try {
    const response = await api.get(`/xendit/invoices/${invoiceId}`);
    return {
      success: true,
      data: response.data.data,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to get invoice URL",
    };
  }
};
