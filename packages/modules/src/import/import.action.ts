"use server";

import type { ActionResponse, ApiResponse } from "@workspace/types";

import { axiosInstance as api } from "../lib/axios.server";

// POST /transactions/import now enqueues onto the Go worker (apps/worker)
// instead of processing synchronously — it returns a jobId immediately, and
// callers poll getImportJobStatus until it settles.
export interface StartImportResult {
  jobId: string;
}

export const startTransactionsImport = async (
  formData: FormData,
): Promise<ActionResponse<StartImportResult>> => {
  try {
    const response = await api.post("/transactions/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const apiResponse = (response as any)
      ._api_response as ApiResponse<StartImportResult>;
    const result = apiResponse?.data ?? response.data?.data;
    return { success: true, data: result };
  } catch (error: any) {
    return {
      success: false,
      error:
        error.response?.data?.message ||
        error.response?.data?.error ||
        "Failed to start import",
    };
  }
};

export type ImportJobStatus = "pending" | "succeeded" | "failed";

export interface ImportJobResult {
  jobId: string;
  status: ImportJobStatus;
  imported: number | null;
  skipped: number | null;
  error: string | null;
}

export const getImportJobStatus = async (
  jobId: string,
): Promise<ActionResponse<ImportJobResult>> => {
  try {
    const response = await api.get(`/transactions/import/${jobId}`);
    const apiResponse = (response as any)
      ._api_response as ApiResponse<ImportJobResult>;
    const result = apiResponse?.data ?? response.data?.data;
    return { success: true, data: result };
  } catch (error: any) {
    return {
      success: false,
      error:
        error.response?.data?.message ||
        error.response?.data?.error ||
        "Failed to get import status",
    };
  }
};
