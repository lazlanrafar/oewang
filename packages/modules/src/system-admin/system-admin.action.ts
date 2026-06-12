import { axiosInstance as api } from "../lib/axios.server";

import type {
  ActionResponse,
  ApiResponse,
  PaginationMeta,
  SystemAdminUser,
  SystemAdminUserStats,
  SystemAdminWorkspace,
  SystemAdminWorkspaceStats,
  SystemAdminPlan,
} from "@workspace/types";

export const getSystemAdminUsers = async (params: {
  page?: number;
  limit?: number;
  search?: string;
  system_role?: string;
  start?: string;
  end?: string;
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
  role: "superadmin" | "owner" | "finance" | "user",
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

export const getSystemAdminWorkspaces = async (params: {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}): Promise<
  ActionResponse<{
    workspaces: SystemAdminWorkspace[];
    meta: PaginationMeta;
  }>
> => {
  try {
    const response = await api.get("/system-admins/workspaces", {
      params,
    });
    const apiResponse = (response as any)._api_response as ApiResponse<
      SystemAdminWorkspace[]
    >;

    if (apiResponse) {
      return {
        success: true,
        data: {
          workspaces: apiResponse.data ?? [],
          meta: apiResponse.meta!.pagination!,
        },
      };
    }

    return {
      success: true,
      data: {
        workspaces: response.data.data,
        meta: response.data.meta.pagination,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch workspaces",
    };
  }
};

export const getSystemAdminUserStats = async (params?: {
  start?: string;
  end?: string;
}): Promise<ActionResponse<SystemAdminUserStats>> => {
  try {
    const response = await api.get("/system-admins/users/stats", { params });
    const apiResponse = (response as any)._api_response as
      | ApiResponse<SystemAdminUserStats>
      | undefined;

    const data =
      apiResponse?.data ??
      (response.data as ApiResponse<SystemAdminUserStats>).data ??
      null;

    if (!data) {
      return { success: false, error: "Failed to fetch user stats" };
    }

    return { success: true, data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch user stats",
    };
  }
};

export const getSystemAdminWorkspaceStats = async (): Promise<
  ActionResponse<SystemAdminWorkspaceStats>
> => {
  try {
    const response = await api.get("/system-admins/workspaces/stats");
    const apiResponse = (response as any)._api_response as
      | ApiResponse<SystemAdminWorkspaceStats>
      | undefined;

    const data =
      apiResponse?.data ??
      (response.data as ApiResponse<SystemAdminWorkspaceStats>).data ??
      null;

    if (!data) {
      return { success: false, error: "Failed to fetch workspace stats" };
    }

    return { success: true, data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch workspace stats",
    };
  }
};

export const getSystemAdminPlans = async (): Promise<
  ActionResponse<SystemAdminPlan[]>
> => {
  try {
    const response = await api.get("/system-admins/plans");
    const apiResponse = (response as any)._api_response as ApiResponse<
      SystemAdminPlan[]
    >;

    return {
      success: true,
      data: apiResponse ? (apiResponse.data ?? []) : response.data.data,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch plans",
    };
  }
};

export const updateWorkspacePlanAction = async (
  workspaceId: string,
  planId: string,
): Promise<ActionResponse<void>> => {
  try {
    await api.patch(`/system-admins/workspaces/${workspaceId}/plan`, {
      planId,
    });
    return { success: true, data: undefined };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to update workspace plan",
    };
  }
};
