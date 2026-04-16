"use server";

import { axiosInstance as api } from "../lib/axios.server";
import type { ActionResponse } from "@workspace/types";

/**
 * Mayar actions — REST wrappers for Mayar payment gateway endpoints.
 */

export const createCheckoutSession = async (
  priceId?: string | null,
  workspaceId?: string,
  returnPath?: string,
  type?: "subscription" | "payment",
  addonType?: "ai" | "vault",
  amount?: number,
  addonId?: string,
  billing?: "monthly" | "annual",
): Promise<ActionResponse<{ url: string }>> => {
  try {
    const response = await api.post("/mayar/checkout", {
      priceId,
      workspaceId,
      returnPath,
      type,
      addonType,
      amount,
      addonId,
      billing,
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
    const response = await api.post("/mayar/portal");
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
    const response = await api.post("/mayar/cancel-subscription");
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
  transactionId: string,
): Promise<ActionResponse<{ url: string }>> => {
  try {
    const response = await api.get(`/mayar/invoices/${transactionId}`);
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
