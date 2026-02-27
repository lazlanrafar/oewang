"use server";

import type { ActionResponse } from "@workspace/types";

import { axiosInstance as api } from "../lib/axios";

export interface Wallet {
  id: string;
  workspaceId: string;
  groupId: string | null;
  name: string;
  balance: number;
  isIncludedInTotals: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

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

export const getWallets = async (): Promise<ActionResponse<Wallet[]>> => {
  try {
    const res = await api.get("/wallets");
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch wallets",
    };
  }
};

export const createWallet = async (data: CreateWalletData): Promise<ActionResponse<Wallet>> => {
  try {
    const res = await api.post("/wallets", data);
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to create wallet",
    };
  }
};

export const updateWallet = async (id: string, data: UpdateWalletData): Promise<ActionResponse<Wallet>> => {
  try {
    const res = await api.put(`/wallets/${id}`, data);
    return { success: true, data: res.data };
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
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to reorder wallets",
    };
  }
};

export const deleteWallet = async (id: string): Promise<ActionResponse<void>> => {
  try {
    const res = await api.delete(`/wallets/${id}`);
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to delete wallet",
    };
  }
};
