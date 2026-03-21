"use server";

import { axiosInstance as api } from "../lib/axios.server";
import type { ActionResponse } from "@workspace/types";

/**
 * Stripe actions — REST wrappers for Stripe endpoints.
 */

export const createCheckoutSession = async (
  priceId: string,
  workspaceId?: string,
  returnPath?: string,
): Promise<ActionResponse<{ url: string }>> => {
  try {
    const response = await api.post("/stripe/checkout", {
      priceId,
      workspaceId,
      returnPath,
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
    const response = await api.post("/stripe/portal");
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
    const response = await api.post("/stripe/cancel-subscription");
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
    const response = await api.get(`/stripe/invoices/${invoiceId}`);
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
