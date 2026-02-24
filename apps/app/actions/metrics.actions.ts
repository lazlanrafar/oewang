"use server";

import { axiosInstance as api } from "@/lib/axios";
import type { ActionResponse } from "@workspace/types";

export interface ChartDataPoint {
  name: string;
  current: number;
  previous?: number;
  average?: number;
}

export const getRevenueMetrics = async (): Promise<
  ActionResponse<ChartDataPoint[]>
> => {
  try {
    const res = await api.get("/metrics/revenue");
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error:
        error?.response?.data?.message || "Failed to fetch revenue metrics",
    };
  }
};

export const getExpenseMetrics = async (): Promise<
  ActionResponse<ChartDataPoint[]>
> => {
  try {
    const res = await api.get("/metrics/expenses");
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error:
        error?.response?.data?.message || "Failed to fetch expense metrics",
    };
  }
};

export const getBurnRateMetrics = async (): Promise<
  ActionResponse<ChartDataPoint[]>
> => {
  try {
    const res = await api.get("/metrics/burn-rate");
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error:
        error?.response?.data?.message || "Failed to fetch burn rate metrics",
    };
  }
};
