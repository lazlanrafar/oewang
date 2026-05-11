"use server";

import type { ActionResponse, ApiResponse, Wallet } from "@workspace/types";
import { axiosInstance as api } from "../lib/axios.server";

export interface CreateWalletData {
  name: string;
  groupId?: string | null;
  balance?: string;
  isIncludedInTotals?: boolean;
}

export interface UpdateWalletData {
  name?: string;
  groupId?: string | null;
  balance?: string;
  isIncludedInTotals?: boolean;
  sortOrder?: number;
}

export const getWallets = async (filters?: {
  search?: string;
  groupId?: string;
  page?: number;
  limit?: number;
}): Promise<ApiResponse<Wallet[]>> => {
  try {
    const res = await api.get("/wallets", { params: filters });
    return (res as any)._api_response;
  } catch (error: any) {
    return {
      success: false,
      data: [],
      code: "FETCH_ERROR",
      message: error.response?.data?.message || "Failed to fetch wallets",
      meta: { timestamp: Date.now() },
    };
  }
};

export const getWallet = async (id: string): Promise<ActionResponse<Wallet>> => {
  try {
    const res = await api.get(`/wallets/${id}`);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch wallet",
    };
  }
};

export const createWallet = async (
  data: CreateWalletData,
): Promise<ActionResponse<Wallet>> => {
  try {
    const res = await api.post("/wallets", data);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to create wallet",
    };
  }
};

export const updateWallet = async (
  id: string,
  data: UpdateWalletData,
): Promise<ActionResponse<Wallet>> => {
  try {
    const res = await api.put(`/wallets/${id}`, data);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to update wallet",
    };
  }
};

export const reorderWallets = async (
  updates: { id: string; sortOrder: number; groupId?: string | null }[],
): Promise<ActionResponse<void>> => {
  try {
    const res = await api.put("/wallets/reorder", { updates });
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to reorder wallets",
    };
  }
};

export const deleteWallet = async (
  id: string,
): Promise<ActionResponse<void>> => {
  try {
    const res = await api.delete(`/wallets/${id}`);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to delete wallet",
    };
  }
};
