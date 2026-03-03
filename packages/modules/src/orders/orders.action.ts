import { axiosInstance as api } from "../lib/axios";
import type {
  ActionResponse,
  ApiResponse,
  PaginationMeta,
  AdminOrderListing,
} from "@workspace/types";

export const getAdminOrders = async (params: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<
  ActionResponse<{
    orders: AdminOrderListing[];
    meta: PaginationMeta;
  }>
> => {
  try {
    const response = await api.get("/orders", {
      params,
    });

    // The axios interceptor puts the decrypted/unwrapped data in _api_response
    const apiResponse = (response as any)._api_response as ApiResponse<
      AdminOrderListing[]
    >;

    if (apiResponse) {
      return {
        success: true,
        data: {
          orders: apiResponse.data ?? [],
          meta: apiResponse.meta!.pagination!,
        },
      };
    }

    return {
      success: true,
      data: {
        orders: response.data.data,
        meta: response.data.meta.pagination,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch orders",
    };
  }
};
