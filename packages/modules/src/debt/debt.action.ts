"use server";

import type { ActionResponse, Debt, DebtPayment } from "@workspace/types";
import { axiosInstance as api } from "../lib/axios.server";

export interface DebtWithContact extends Debt {
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  sourceTransactionName: string | null;
}

export const getDebts = async (filters?: {
  contactId?: string;
}): Promise<ActionResponse<DebtWithContact[]>> => {
  try {
    const res = await api.get("/debts", { params: filters });
    return { success: true, data: res.data?.data || [] };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch debts",
    };
  }
};

export const createDebt = async (data: {
  contactId: string;
  type: "payable" | "receivable";
  amount: number | string;
  description?: string;
  dueDate?: string;
  sourceTransactionId?: string;
}): Promise<ActionResponse<Debt>> => {
  try {
    const res = await api.post("/debts", data);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to create debt",
    };
  }
};

export const updateDebt = async (
  id: string,
  data: {
    description?: string;
    dueDate?: string;
    status?: "unpaid" | "partial" | "paid";
  }
): Promise<ActionResponse<Debt>> => {
  try {
    const res = await api.patch(`/debts/${id}`, data);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to update debt",
    };
  }
};

export const payDebt = async (
  id: string,
  data: {
    amount: number | string;
    walletId?: string;
  }
): Promise<ActionResponse<DebtPayment>> => {
  try {
    const res = await api.post(`/debts/${id}/pay`, data);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to record payment",
    };
  }
};

export const bulkPayDebt = async (data: {
  payments: Array<{ id: string; amount: number | string }>;
  walletId?: string;
}): Promise<ActionResponse<DebtPayment[]>> => {
  try {
    const res = await api.post(`/debts/bulk-pay`, data);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to record bulk payments",
    };
  }
};

export const deleteDebt = async (id: string): Promise<ActionResponse<void>> => {
  try {
    const res = await api.delete(`/debts/${id}`);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to delete debt",
    };
  }
};

export const splitBill = async (data: {
  name: string;
  totalAmount: number | string;
  walletId?: string;
  categoryId?: string;
  sourceTransactionId?: string;
  splits: Array<{ contactId: string; amount: number | string }>;
}): Promise<ActionResponse<{ sourceTxId: string; createdDebts: Debt[] }>> => {
  try {
    const res = await api.post("/debts/split", data);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to split bill",
    };
  }
};
