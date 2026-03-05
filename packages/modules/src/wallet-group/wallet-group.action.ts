"use server";

import type { ActionResponse } from "@workspace/types";

import { axiosInstance as api } from "../lib/axios.server";

export interface WalletGroup {
  id: string;
  workspaceId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWalletGroupData {
  name: string;
}

export interface UpdateWalletGroupData {
  name?: string;
  sortOrder?: number;
}

export const getWalletGroups = async (): Promise<
  ActionResponse<WalletGroup[]>
> => {
  try {
    const res = await api.get("/wallet-groups");
    return { success: true, data: res.data?.data || [] };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch wallet groups",
    };
  }
};

export const createWalletGroup = async (
  data: CreateWalletGroupData,
): Promise<ActionResponse<WalletGroup>> => {
  try {
    const res = await api.post("/wallet-groups", data);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to create wallet group",
    };
  }
};

export const updateWalletGroup = async (
  id: string,
  data: UpdateWalletGroupData,
): Promise<ActionResponse<WalletGroup>> => {
  try {
    const res = await api.put(`/wallet-groups/${id}`, data);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to update wallet group",
    };
  }
};

export const reorderWalletGroups = async (
  updates: { id: string; sortOrder: number }[],
): Promise<ActionResponse<void>> => {
  try {
    const res = await api.put("/wallet-groups/reorder", { updates });
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to reorder wallet groups",
    };
  }
};

export const deleteWalletGroup = async (
  id: string,
): Promise<ActionResponse<void>> => {
  try {
    const res = await api.delete(`/wallet-groups/${id}`);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to delete wallet group",
    };
  }
};
