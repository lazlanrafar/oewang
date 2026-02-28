import { axiosInstance as api } from "../lib/axios";

import type {
  ActionResponse,
  ApiResponse,
  PaginationMeta,
  Pricing,
  CreatePricingInput,
  UpdatePricingInput,
} from "@workspace/types";

export const getPricing = async (params?: {
  page?: string;
  limit?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  is_active?: string;
}): Promise<
  ActionResponse<{
    pricingList: Pricing[];
    meta: PaginationMeta;
  }>
> => {
  try {
    const response = await api.get("/pricing", { params });
    const apiResponse = (response as any)._api_response as ApiResponse<
      Pricing[]
    >;

    if (apiResponse) {
      return {
        success: true,
        data: {
          pricingList: apiResponse.data ?? [],
          meta: apiResponse.meta!.pagination!,
        },
      };
    }

    return {
      success: true,
      data: {
        pricingList: response.data.data,
        meta: response.data.meta.pagination,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch pricing list",
    };
  }
};

export const createPricingAction = async (
  payload: CreatePricingInput,
): Promise<ActionResponse<Pricing>> => {
  try {
    const response = await api.post("/pricing", payload);
    const apiResponse = (response as any)._api_response as ApiResponse<Pricing>;

    return {
      success: true,
      data: apiResponse?.data ?? response.data.data,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to create pricing plan",
    };
  }
};

export const updatePricingAction = async (
  id: string,
  payload: UpdatePricingInput,
): Promise<ActionResponse<Pricing>> => {
  try {
    const response = await api.patch(`/pricing/${id}`, payload);
    const apiResponse = (response as any)._api_response as ApiResponse<Pricing>;

    return {
      success: true,
      data: apiResponse?.data ?? response.data.data,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to update pricing plan",
    };
  }
};

export const deletePricingAction = async (
  id: string,
): Promise<ActionResponse<void>> => {
  try {
    await api.delete(`/pricing/${id}`);
    return { success: true, data: undefined };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to delete pricing plan",
    };
  }
};
