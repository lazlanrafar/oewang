"use server";

import type {
  ActionResponse,
  ApiResponse,
  Feedback,
  FeedbackStats,
  PaginationMeta,
} from "@workspace/types";
import { axiosInstance as api } from "../lib/axios.server";

export const getFeedback = async (params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  type?: string;
  source?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}): Promise<
  ActionResponse<{
    feedback: Feedback[];
    meta: PaginationMeta;
  }>
> => {
  try {
    const response = await api.get("/feedback", { params });
    const apiResponse = (response as any)._api_response as ApiResponse<
      Feedback[]
    >;

    if (apiResponse) {
      return {
        success: true,
        data: {
          feedback: apiResponse.data ?? [],
          meta: apiResponse.meta!.pagination!,
        },
      };
    }

    const data: any = response.data?.data;
    return {
      success: true,
      data: {
        feedback: Array.isArray(data) ? data : [],
        meta: response.data?.meta?.pagination ?? ({} as PaginationMeta),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch feedback",
    };
  }
};

export const getFeedbackStats = async (): Promise<
  ActionResponse<FeedbackStats>
> => {
  try {
    const response = await api.get("/feedback/stats");
    const apiResponse = (response as any)._api_response as
      | ApiResponse<FeedbackStats>
      | undefined;

    const data =
      apiResponse?.data ??
      (response.data as ApiResponse<FeedbackStats>).data ??
      null;

    if (!data) {
      return { success: false, error: "Failed to fetch feedback stats" };
    }

    return { success: true, data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch feedback stats",
    };
  }
};

export const getFeedbackById = async (
  id: string,
): Promise<ActionResponse<Feedback>> => {
  try {
    const response = await api.get(`/feedback/${id}`);
    const apiResponse = (response as any)._api_response as ApiResponse<Feedback>;

    return { success: true, data: apiResponse?.data ?? response.data.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch feedback",
    };
  }
};

export const updateFeedbackStatusAction = async (
  id: string,
  status: string,
  adminNote?: string,
): Promise<ActionResponse<void>> => {
  try {
    await api.patch(`/feedback/${id}/status`, {
      status,
      admin_note: adminNote,
    });
    return { success: true, data: undefined };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to update feedback status",
    };
  }
};
