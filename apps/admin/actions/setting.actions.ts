"use server";

import { revalidatePath } from "next/cache";

import type { ActionResponse } from "@workspace/types";

import { axiosInstance as api } from "@/lib/axios";
import type { TransactionSettings } from "@/types/settings";

export const getTransactionSettings = async (): Promise<ActionResponse<TransactionSettings>> => {
  try {
    const res = await api.get("/settings/transaction");
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch transaction settings",
    };
  }
};

export const updateTransactionSettings = async (
  data: Partial<TransactionSettings>,
): Promise<ActionResponse<TransactionSettings>> => {
  try {
    const res = await api.patch("/settings/transaction", data);
    revalidatePath("/settings");
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to update transaction settings",
    };
  }
};

export const getSubCurrencies = async (): Promise<ActionResponse<any>> => {
  try {
    const res = await api.get("/settings/sub-currencies");
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch sub-currencies",
    };
  }
};

export const addSubCurrency = async (data: { currencyCode: string }): Promise<ActionResponse<any>> => {
  try {
    const res = await api.post("/settings/sub-currencies", data);
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to add sub-currency",
    };
  }
};

export const removeSubCurrency = async (id: string): Promise<ActionResponse<void>> => {
  try {
    const res = await api.delete(`/settings/sub-currencies/${id}`);
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to remove sub-currency",
    };
  }
};

export const getExchangeRates = async (base?: string): Promise<ActionResponse<any>> => {
  try {
    const res = await api.get("/settings/rates", { params: { base } });
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch exchange rates",
    };
  }
};

export const convertCurrency = async (params: {
  amount: number;
  from: string;
  to: string;
}): Promise<ActionResponse<any>> => {
  try {
    const res = await api.get("/settings/rates/convert", { params });
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to convert currency",
    };
  }
};
