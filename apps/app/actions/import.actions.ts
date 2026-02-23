"use server";

import { axiosInstance as api } from "@/lib/axios";
import type { ActionResponse } from "@workspace/types";

// Re-export the type so frontend can use it
export interface ImportedTransaction {
  id: string;
  name?: string;
  amount: string;
  date: string;
  type: "income" | "expense" | "transfer";
}

export interface ImportResult {
  imported: number;
  skipped: number;
  transactions: ImportedTransaction[];
}

export const importTransactions = async (
  formData: FormData,
): Promise<ActionResponse<ImportResult>> => {
  try {
    const res = await api.post("/transactions/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error:
        error.response?.data?.message ||
        error.response?.data?.error ||
        "Failed to import transactions",
    };
  }
};
