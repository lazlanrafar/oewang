"use server";

import type { ActionResponse, ApiResponse } from "@workspace/types";
import type { TransactionItem } from "@workspace/types";
import { axiosInstance as api } from "../lib/axios.server";

export const getTransactionItems = async (
  transactionId: string,
  params?: { page?: number; limit?: number },
): Promise<ApiResponse<TransactionItem[]>> => {
  try {
    const response = await api.get(`/transactions/${transactionId}/items`, {
      params,
    });

    const apiResponse = (response as any)._api_response as ApiResponse<
      TransactionItem[]
    >;

    if (apiResponse) return apiResponse;

    return {
      success: true,
      data: response.data?.data ?? [],
      code: "OK",
      message: "Items retrieved",
      meta: { timestamp: Date.now() },
    };
  } catch (error: any) {
    return {
      success: false,
      code: error.response?.data?.code || "UNKNOWN_ERROR",
      message:
        error.response?.data?.message || "Failed to fetch transaction items",
      data: [],
      meta: { timestamp: Date.now() },
    };
  }
};

export const deleteTransactionItem = async (
  transactionId: string,
  itemId: string,
): Promise<ActionResponse<void>> => {
  try {
    await api.delete(`/transactions/${transactionId}/items/${itemId}`);
    return { success: true, data: undefined };
  } catch (error: any) {
    return {
      success: false,
      error:
        error.response?.data?.message || "Failed to delete transaction item",
    };
  }
};
