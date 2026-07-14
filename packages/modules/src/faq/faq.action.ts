import type {
  ActionResponse,
  ApiResponse,
  CreateFaqInput,
  Faq,
  FaqStats,
  PaginationMeta,
  UpdateFaqInput,
} from "@workspace/types";
import { axiosInstance as api } from "../lib/axios.server";

export const getFaqs = async (params?: {
  page?: string;
  limit?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  published?: string;
}): Promise<
  ActionResponse<{
    faqList: Faq[];
    meta: PaginationMeta;
  }>
> => {
  try {
    const response = await api.get("/faqs", { params });
    const apiResponse = (response as any)._api_response as ApiResponse<Faq[]>;

    const data: any = apiResponse?.data ?? response.data?.data;
    return {
      success: true,
      data: {
        faqList: Array.isArray(data) ? data : (data?.faqList ?? []),
        meta:
          apiResponse?.meta?.pagination ||
          response.data?.meta?.pagination ||
          ({} as PaginationMeta),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch FAQs",
    };
  }
};

export const getFaqStats = async (): Promise<ActionResponse<FaqStats>> => {
  try {
    const response = await api.get("/faqs/stats");
    const apiResponse = (response as any)._api_response as
      | ApiResponse<FaqStats>
      | undefined;

    const data =
      apiResponse?.data ??
      (response.data as ApiResponse<FaqStats>).data ??
      null;

    if (!data) return { success: false, error: "Failed to fetch FAQ stats" };

    return { success: true, data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch FAQ stats",
    };
  }
};

export const createFaqAction = async (
  payload: CreateFaqInput,
): Promise<ActionResponse<Faq>> => {
  try {
    const response = await api.post("/faqs", payload);
    const apiResponse = (response as any)._api_response as ApiResponse<Faq>;

    return { success: true, data: apiResponse?.data ?? response.data.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to create FAQ",
    };
  }
};

export const updateFaqAction = async (
  id: string,
  payload: UpdateFaqInput,
): Promise<ActionResponse<Faq>> => {
  try {
    const response = await api.patch(`/faqs/${id}`, payload);
    const apiResponse = (response as any)._api_response as ApiResponse<Faq>;

    return { success: true, data: apiResponse?.data ?? response.data.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to update FAQ",
    };
  }
};

export const deleteFaqAction = async (
  id: string,
): Promise<ActionResponse<void>> => {
  try {
    await api.delete(`/faqs/${id}`);
    return { success: true, data: undefined };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to delete FAQ",
    };
  }
};
