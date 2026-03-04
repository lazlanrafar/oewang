"use server";

import type {
  ActionResponse,
  ApiResponse,
  Transaction,
} from "@workspace/types";

import { axiosInstance as api } from "../lib/axios.server";

export const getTransactions = async (params: {
  page?: number;
  limit?: number;
  type?: string;
  walletId?: string;
  categoryId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<ApiResponse<Transaction[]>> => {
  try {
    const response = await api.get("/transactions", {
      params,
    });

    // The interceptor puts the full ApiResponse in _api_response
    // and sets response.data to the payload (Transaction[])
    const apiResponse = (response as any)._api_response as ApiResponse<
      Transaction[]
    >;

    if (apiResponse) {
      return apiResponse;
    }

    // Fallback if not intercepted/encrypted as expected (e.g. error or different env)
    return {
      success: true,
      data: response.data.data,
      code: "OK",
      message: "Transactions retrieved",
      meta: {
        timestamp: Date.now(),
        pagination: {
          total: response.data.data.length,
          page: params.page || 1,
          limit: params.limit || 50,
          total_pages: 1,
        },
      },
    };
  } catch (error: any) {
    return {
      success: false,
      code: error.response?.data?.code || "UNKNOWN_ERROR",
      message: error.response?.data?.message || "Failed to fetch transactions",
      data: [],
      meta: {
        timestamp: Date.now(),
        pagination: {
          total: 0,
          page: params.page || 1,
          limit: params.limit || 10,
          total_pages: 0,
        },
      },
    };
  }
};

export const createTransaction = async (
  data: Partial<Transaction>,
): Promise<ActionResponse<Transaction>> => {
  try {
    const response = await api.post<ApiResponse<Transaction>>(
      "/transactions",
      data,
    );
    return { success: true, data: response.data.data as Transaction };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to create transaction",
    };
  }
};

export const updateTransaction = async (
  id: string,
  data: Partial<Transaction>,
): Promise<ActionResponse<Transaction>> => {
  try {
    const response = await api.put<ApiResponse<Transaction>>(
      `/transactions/${id}`,
      data,
    );
    const apiResponse = (response as any)
      ._api_response as ApiResponse<Transaction>;
    const transaction = apiResponse?.data ?? response.data?.data;
    return { success: true, data: transaction as Transaction };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to update transaction",
    };
  }
};

export const deleteTransaction = async (
  id: string,
): Promise<ActionResponse<void>> => {
  try {
    await api.delete(`/transactions/${id}`);
    return { success: true, data: undefined };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to delete transaction",
    };
  }
};
