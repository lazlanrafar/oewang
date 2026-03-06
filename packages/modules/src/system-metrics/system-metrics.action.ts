import { axiosInstance as api } from "../lib/axios.server";
import type { ActionResponse, ApiResponse } from "@workspace/types";

export interface SystemMetricsData {
  metrics: {
    totalRevenue: number;
    totalUsers: number;
    totalOrders: number;
    activeWorkspaces: number;
  };
  chartData: {
    date: string;
    revenue: number;
  }[];
}

export const getSystemMetricsOverview = async (params?: {
  start?: string;
  end?: string;
}): Promise<ActionResponse<SystemMetricsData>> => {
  try {
    const response = await api.get("/system-metrics", { params });
    const apiResponse = (response as any)
      ._api_response as ApiResponse<SystemMetricsData>;

    if (apiResponse) {
      return {
        success: true,
        data: apiResponse.data as SystemMetricsData,
      };
    }

    return {
      success: true,
      data: response.data.data as SystemMetricsData,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch system metrics",
    };
  }
};
