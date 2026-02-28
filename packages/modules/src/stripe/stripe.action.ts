import { axiosInstance as api } from "../lib/axios";
import type { ActionResponse } from "@workspace/types";

/**
 * Stripe actions — REST wrappers for Stripe endpoints.
 */

export const createCheckoutSession = async (
  priceId: string,
): Promise<ActionResponse<{ url: string }>> => {
  try {
    const response = await api.post("/stripe/checkout", { priceId });
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
