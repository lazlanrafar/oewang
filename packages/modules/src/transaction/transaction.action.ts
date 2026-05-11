"use server";
import { revalidatePath, revalidateTag as nextRevalidateTag } from "next/cache";

/**
 * Type-safe wrapper for revalidateTag to satisfy the Next.js 16 compiler 
 * requirements while clearing IDE errors caused by signature discrepancies.
 */
const revalidateTag = (nextRevalidateTag as unknown) as (
  tag: string,
  profile: string,
) => void;

import type {
  ActionResponse,
  ApiResponse,
  Transaction,
  TransactionQueryParams,
} from "@workspace/types";

import { axiosInstance as api } from "../lib/axios.server";

export const getTransactions = async (
  params: TransactionQueryParams,
): Promise<ApiResponse<Transaction[]>> => {
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
    const result = response.data.data as Transaction;
    revalidatePath("/transactions");
    revalidateTag("transactions", "max");
    return { success: true, data: result };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to create transaction",
    };
  }
};

export const bulkCreateTransactions = async (
  data: Partial<Transaction>[],
): Promise<
  ActionResponse<{
    imported: number;
    failed: number;
    failures?: { index: number; reason: string }[];
  }>
> => {
  try {
    const response = await api.post<
      ApiResponse<{
        imported: number;
        failed: number;
        failures?: { index: number; reason: string }[];
      }>
    >("/transactions/bulk", data);
    const apiResponse = (response as any)._api_response as ApiResponse<{
      imported: number;
      failed: number;
      failures?: { index: number; reason: string }[];
    }>;
    const result = apiResponse?.data ?? response.data?.data;
    if (!result) {
      return {
        success: false,
        error: "Failed to bulk create transactions: No data returned",
      };
    }

    revalidatePath("/transactions");
    revalidateTag("transactions", "max");

    return {
      success: true,
      data: result,
    };
  } catch (error: any) {
    return {
      success: false,
      error:
        error.response?.data?.message || "Failed to bulk create transactions",
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
    revalidatePath("/transactions");
    revalidateTag("transactions", "max");
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
    revalidatePath("/transactions");
    revalidateTag("transactions", "max");
    return { success: true, data: undefined };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to delete transaction",
    };
  }
};

export const bulkDeleteTransactions = async (
  ids: string[],
): Promise<ActionResponse<{ deleted: number }>> => {
  try {
    const response = await api.post<ApiResponse<{ deleted: number }>>(
      "/transactions/bulk-delete",
      { ids },
    );
    const apiResponse = (response as any)._api_response as ApiResponse<{
      deleted: number;
    }>;
    const result = apiResponse?.data ?? response.data?.data;
    revalidatePath("/transactions");
    revalidateTag("transactions", "max");
    return { success: true, data: result || { deleted: 0 } };
  } catch (error: any) {
    return {
      success: false,
      error:
        error.response?.data?.message || "Failed to delete some transactions",
    };
  }
};

export const getTransactionDebts = async (
  id: string,
): Promise<ActionResponse<any[]>> => {
  try {
    const response = await api.get(`/transactions/${id}/debts`);
    const apiResponse = (response as any)._api_response;
    return { success: true, data: apiResponse?.data ?? response.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error:
        error.response?.data?.message || "Failed to fetch transaction debts",
    };
  }
};

export const exportTransactions = async (params: {
  startDate?: string;
  endDate?: string;
  allData?: string;
}): Promise<ActionResponse<string>> => {
  try {
    const response = await api.get("/transactions/export", {
      params,
      responseType: "text",
    });
    
    return { success: true, data: response.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to export transactions",
    };
  }
};
