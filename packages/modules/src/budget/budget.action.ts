"use server";

import type { ApiResponse, Budget, BudgetStatus, CreateBudgetInput, UpdateBudgetInput } from "@workspace/types";
import { axiosInstance as api } from "../lib/axios.server";

/**
 * Get current month budget status with categories and spending
 */
export async function getBudgetStatus(query?: { month?: number; year?: number }): Promise<ApiResponse<BudgetStatus[]>> {
  try {
    const res = await api.get("/budgets/status", { params: query });
    return (res as any)._api_response || res.data;
  } catch (error: any) {
    return {
      success: false,
      data: [],
      code: "FETCH_ERROR",
      message: error.response?.data?.message || "Failed to fetch budget status",
      meta: { timestamp: Date.now() },
    };
  }
}

/**
 * Create a new budget limit
 */
export async function createBudget(payload: CreateBudgetInput): Promise<ApiResponse<Budget>> {
  try {
    const res = await api.post("/budgets", payload);
    return (res as any)._api_response || res.data;
  } catch (error: any) {
    return {
      success: false,
      data: null as any,
      code: "CREATE_ERROR",
      message: error.response?.data?.message || "Failed to create budget",
      meta: { timestamp: Date.now() },
    };
  }
}

/**
 * Update an existing budget limit
 */
export async function updateBudget(id: string, payload: UpdateBudgetInput): Promise<ApiResponse<Budget>> {
  try {
    const res = await api.put(`/budgets/${id}`, payload);
    return (res as any)._api_response || res.data;
  } catch (error: any) {
    return {
      success: false,
      data: null as any,
      code: "UPDATE_ERROR",
      message: error.response?.data?.message || "Failed to update budget",
      meta: { timestamp: Date.now() },
    };
  }
}

/**
 * Delete a budget limit
 */
export async function deleteBudget(id: string): Promise<ApiResponse<null>> {
  try {
    const res = await api.delete(`/budgets/${id}`);
    return (res as any)._api_response || res.data;
  } catch (error: any) {
    return {
      success: false,
      data: null,
      code: "DELETE_ERROR",
      message: error.response?.data?.message || "Failed to delete budget",
      meta: { timestamp: Date.now() },
    };
  }
}
