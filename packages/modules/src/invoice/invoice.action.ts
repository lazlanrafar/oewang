"use server";

import type { ActionResponse, Invoice } from "@workspace/types";
import { axiosInstance as api } from "../lib/axios.server";

export interface CreateInvoiceData {
  contactId: string;
  invoiceNumber: string;
  issueDate?: string;
  dueDate?: string;
  amount: number;
  vat?: number;
  tax?: number;
  currency: string;
  internalNote?: string;
  noteDetails?: string;
  paymentDetails?: string;
  logoUrl?: string;
  lineItems: Array<{ name: string; quantity: number; price: number }>;
  isPublic?: boolean;
  accessCode?: string;
}

export interface UpdateInvoiceData extends Partial<CreateInvoiceData> {}

export interface GetInvoicesParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

export const getInvoices = async (
  params?: GetInvoicesParams,
): Promise<ActionResponse<any>> => {
  try {
    const res = await api.get("/invoices", { params });
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch invoices",
    };
  }
};

export const getInvoiceById = async (
  id: string,
): Promise<ActionResponse<any>> => {
  try {
    const res = await api.get(`/invoices/${id}`);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch invoice",
    };
  }
};

export const createInvoice = async (
  data: CreateInvoiceData,
): Promise<ActionResponse<Invoice>> => {
  try {
    const res = await api.post("/invoices", data);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to create invoice",
    };
  }
};

export const updateInvoice = async (
  id: string,
  data: UpdateInvoiceData,
): Promise<ActionResponse<Invoice>> => {
  try {
    const res = await api.patch(`/invoices/${id}`, data);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to update invoice",
    };
  }
};

export const deleteInvoice = async (
  id: string,
): Promise<ActionResponse<void>> => {
  try {
    await api.delete(`/invoices/${id}`);
    return { success: true, data: undefined };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to delete invoice",
    };
  }
};

export const getInvoiceToken = async (
  id: string,
): Promise<ActionResponse<{ token: string }>> => {
  try {
    const res = await api.get(`/invoices/${id}/token`);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch invoice token",
    };
  }
};

export const getInvoiceActivity = async (
  id: string,
): Promise<ActionResponse<any[]>> => {
  try {
    const res = await api.get(`/invoices/${id}/activity`);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch invoice activity",
    };
  }
};

export const getPublicInvoice = async (
  token: string,
  code?: string,
): Promise<ActionResponse<any>> => {
  try {
    const res = await api.get(`/public/invoices/${token}`, {
      params: { code },
    });
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch public invoice",
    };
  }
};
