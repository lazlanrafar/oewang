"use server";

import type { ActionResponse } from "@workspace/types";

import { axiosInstance as api } from "../lib/axios.server";

export interface ChartDataPoint {
  name: string;
  current: number;
  previous?: number;
  average?: number;
}

export interface MetricsDateRangeParams {
  startDate?: string;
  endDate?: string;
}

export const getRevenueMetrics = async (
  params?: MetricsDateRangeParams,
): Promise<
  ActionResponse<ChartDataPoint[]>
> => {
  try {
    const res = await api.get("/metrics/revenue", { params });
    return { success: true, data: res.data?.data || [] };
  } catch (error: any) {
    return {
      success: false,
      error:
        error?.response?.data?.message || "Failed to fetch revenue metrics",
    };
  }
};

export const getExpenseMetrics = async (
  params?: MetricsDateRangeParams,
): Promise<
  ActionResponse<ChartDataPoint[]>
> => {
  try {
    const res = await api.get("/metrics/expenses", { params });
    return { success: true, data: res.data?.data || [] };
  } catch (error: any) {
    return {
      success: false,
      error:
        error?.response?.data?.message || "Failed to fetch expense metrics",
    };
  }
};

export const getBurnRateMetrics = async (
  params?: MetricsDateRangeParams,
): Promise<
  ActionResponse<ChartDataPoint[]>
> => {
  try {
    const res = await api.get("/metrics/burn-rate", { params });
    return { success: true, data: res.data?.data || [] };
  } catch (error: any) {
    return {
      success: false,
      error:
        error?.response?.data?.message || "Failed to fetch burn rate metrics",
    };
  }
};

export interface CategoryBreakdownPoint {
  categoryId: string | null;
  name: string;
  value: number;
}

export const getCategoryBreakdown = async (
  type: "income" | "expense" = "expense",
  params?: MetricsDateRangeParams,
): Promise<ActionResponse<CategoryBreakdownPoint[]>> => {
  try {
    const res = await api.get("/metrics/category-breakdown", {
      params: { type, ...params },
    });
    return { success: true, data: res.data?.data || [] };
  } catch (error: any) {
    return {
      success: false,
      error:
        error?.response?.data?.message ||
        "Failed to fetch category breakdown metrics",
    };
  }
};
