"use server";

import type { ActionResponse, BillingInvoice } from "@workspace/types";
import { axiosInstance as api } from "../lib/axios.server";

export const listBillingInvoices = async (): Promise<
  ActionResponse<BillingInvoice[]>
> => {
  try {
    const res = await api.get("/billing-invoices");
    return { success: true, data: res.data?.data || [] };
  } catch (error: any) {
    return {
      success: false,
      error:
        error.response?.data?.message || "Failed to fetch billing invoices",
    };
  }
};

export const getBillingInvoice = async (
  id: string,
): Promise<ActionResponse<BillingInvoice>> => {
  try {
    const res = await api.get(`/billing-invoices/${id}`);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error:
        error.response?.data?.message || "Failed to fetch billing invoice",
    };
  }
};

/** Resolve the internal invoice id from an order id (for "View" buttons). */
export const getBillingInvoiceByOrder = async (
  orderId: string,
): Promise<ActionResponse<BillingInvoice>> => {
  try {
    const res = await api.get(`/billing-invoices/by-order/${orderId}`);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error:
        error.response?.data?.message || "Failed to fetch billing invoice",
    };
  }
};
