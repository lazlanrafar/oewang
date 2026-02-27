import { axiosInstance as api } from "../lib/axios";

import type {
  ActionResponse,
  ApiResponse,
  PaginationMeta,
  SystemAdminUser,
} from "@workspace/types";

export const getSystemAdminUsers = async (params: {
  page?: number;
  limit?: number;
  search?: string;
  system_role?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}): Promise<
  ActionResponse<{
    users: SystemAdminUser[];
    meta: PaginationMeta;
  }>
> => {
  try {
    const response = await api.get("/system-admins/users", {
      params,
    });
    const apiResponse = (response as any)._api_response as ApiResponse<
      SystemAdminUser[]
    >;

    if (apiResponse) {
      return {
        success: true,
        data: {
          users: apiResponse.data ?? [],
          meta: apiResponse.meta!.pagination!,
        },
      };
    }

    // Fallback if not intercepted/encrypted
    return {
      success: true,
      data: {
        users: response.data.data,
        meta: response.data.meta.pagination,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch users",
    };
  }
};

export const updateSystemRoleAction = async (
  userId: string,
  role: "owner" | "finance" | "user",
): Promise<ActionResponse<void>> => {
  try {
    await api.patch(`/system-admins/users/${userId}/role`, { role });
    return { success: true, data: undefined };
  } catch (error: any) {
    return {
      success: false,
      error:
        error.response?.data?.message || `Failed to update user to ${role}`,
    };
  }
};
