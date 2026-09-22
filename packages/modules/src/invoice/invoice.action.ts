"use server";

import type {
  ActionResponse,
  ApiResponse,
  Invoice,
  InvoiceActivityItem,
  InvoiceCreateData,
  PublicInvoiceData,
  InvoiceUpdateData,
} from "@workspace/types";
import type { AxiosResponse } from "axios";
import { axiosInstance as api } from "../lib/axios.server";
import { extractErrorMessage } from "../lib/error-message";
import { reportActionError } from "../lib/report-error";

export type CreateInvoiceData = InvoiceCreateData;
export type UpdateInvoiceData = InvoiceUpdateData;

export interface GetInvoicesParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

type ApiEnvelopeResponse<T> = AxiosResponse<ApiResponse<T>> & {
  _api_response?: ApiResponse<T>;
};

export const getInvoices = async (
  params?: GetInvoicesParams,
): Promise<ApiResponse<Invoice[]>> => {
  try {
    const response = (await api.get("/invoices", {
      params,
    })) as ApiEnvelopeResponse<Invoice[]>;

    const apiResponse = response._api_response ?? response.data;
    if (apiResponse) {
      return apiResponse;
    }

    return {
      success: true,
      code: "OK",
      message: "Invoices retrieved",
      data: [],
      meta: {
        timestamp: Date.now(),
        pagination: {
          total: 0,
          page: params?.page || 1,
          limit: params?.limit || 50,
          total_pages: 1,
        },
      },
    };
  } catch (error) {
    await reportActionError(error, { action: "getInvoices" });
    return {
      success: false,
      code: "FETCH_INVOICES_FAILED",
      message: extractErrorMessage(error, "Failed to fetch invoices"),
      data: [],
      meta: {
        timestamp: Date.now(),
        pagination: {
          total: 0,
          page: params?.page || 1,
          limit: params?.limit || 50,
          total_pages: 0,
        },
      },
    };
  }
};

export const getInvoiceById = async (
  id: string,
): Promise<ActionResponse<Invoice>> => {
  try {
    const res = await api.get(`/invoices/${id}`);
    return { success: true, data: res.data?.data };
  } catch (error) {
    await reportActionError(error, { action: "getInvoiceById" });
    return {
      success: false,
      error: extractErrorMessage(error, "Failed to fetch invoice"),
    };
  }
};

export const createInvoice = async (
  data: CreateInvoiceData,
): Promise<ActionResponse<Invoice>> => {
  try {
    const res = await api.post("/invoices", data);
    return { success: true, data: res.data?.data };
  } catch (error) {
    await reportActionError(error, { action: "createInvoice" });
    return {
      success: false,
      error: extractErrorMessage(error, "Failed to create invoice"),
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
  } catch (error) {
    await reportActionError(error, { action: "updateInvoice" });
    return {
      success: false,
      error: extractErrorMessage(error, "Failed to update invoice"),
    };
  }
};

export const deleteInvoice = async (
  id: string,
): Promise<ActionResponse<void>> => {
  try {
    await api.delete(`/invoices/${id}`);
    return { success: true, data: undefined };
  } catch (error) {
    await reportActionError(error, { action: "deleteInvoice" });
    return {
      success: false,
      error: extractErrorMessage(error, "Failed to delete invoice"),
    };
  }
};

export const getInvoiceToken = async (
  id: string,
): Promise<ActionResponse<{ token: string }>> => {
  try {
    const res = await api.get(`/invoices/${id}/token`);
    return { success: true, data: res.data?.data };
  } catch (error) {
    await reportActionError(error, { action: "getInvoiceToken" });
    return {
      success: false,
      error: extractErrorMessage(error, "Failed to fetch invoice token"),
    };
  }
};

export const getInvoiceActivity = async (
  id: string,
): Promise<ActionResponse<InvoiceActivityItem[]>> => {
  try {
    const res = await api.get(`/invoices/${id}/activity`);
    return { success: true, data: res.data?.data };
  } catch (error) {
    await reportActionError(error, { action: "getInvoiceActivity" });
    return {
      success: false,
      error: extractErrorMessage(error, "Failed to fetch invoice activity"),
    };
  }
};

export const getPublicInvoice = async (
  token: string,
  code?: string,
): Promise<ActionResponse<PublicInvoiceData>> => {
  try {
    const res = await api.get(`/public/invoices/${token}`, {
      params: { code },
    });
    return { success: true, data: res.data?.data };
  } catch (error) {
    await reportActionError(error, { action: "getPublicInvoice" });
    return {
      success: false,
      error: extractErrorMessage(error, "Failed to fetch public invoice"),
    };
  }
};
