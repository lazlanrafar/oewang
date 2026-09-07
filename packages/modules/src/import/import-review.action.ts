"use server";

import type { ActionResponse } from "@workspace/types";

import { axiosInstance as api } from "../lib/axios.server";

// Mirrors the row shape transaction.action.ts's bulkCreateTransactions
// already sends to /transactions/bulk — the AI-review stage runs on the
// exact same rows before that final commit.
export interface ImportReviewRow {
  walletId?: string;
  toWalletId?: string;
  categoryId?: string;
  amount: string;
  date: string;
  type: string;
  name?: string;
  description?: string;
}

export type ImportSuggestionType =
  | "category"
  | "type_sign"
  | "duplicate"
  | "anomaly";

export interface ImportReviewSuggestion {
  rowIndex: number;
  type: ImportSuggestionType;
  field: "categoryId" | "amount" | "type" | null;
  currentValue: string | null;
  suggestedValue: string | null;
  reason: string;
  confidence: number | null;
  meta?: Record<string, unknown>;
}

type ReviewResult = {
  suggestions: ImportReviewSuggestion[];
  degraded?: { reason: string };
};

async function postReview(
  path: string,
  rows: ImportReviewRow[],
): Promise<ActionResponse<ReviewResult>> {
  try {
    const response = await api.post<{ data: ReviewResult }>(
      path,
      { rows },
      // Batches can be hundreds of rows through an LLM/DB comparison —
      // mirror bulkCreateTransactions' generous timeout.
      { timeout: 60_000 },
    );
    const apiResponse = (response as any)._api_response as
      | { data: ReviewResult }
      | undefined;
    const result = apiResponse?.data ?? response.data?.data;
    if (!result) {
      return { success: false, error: `${path}: no data returned` };
    }
    return { success: true, data: result };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || `${path} failed`,
    };
  }
}

export const checkDuplicateTransactions = async (
  rows: ImportReviewRow[],
): Promise<ActionResponse<ReviewResult>> =>
  postReview("/transactions/import-review/duplicates", rows);

export const categorizeAndValidateTransactions = async (
  rows: ImportReviewRow[],
): Promise<ActionResponse<ReviewResult>> =>
  postReview("/transactions/import-review/categorize", rows);

export const detectAnomalousTransactions = async (
  rows: ImportReviewRow[],
): Promise<ActionResponse<ReviewResult>> =>
  postReview("/transactions/import-review/anomalies", rows);
