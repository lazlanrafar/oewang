"use server";

import type { ActionResponse, Category } from "@workspace/types";

import { axiosInstance as api } from "../lib/axios";

export interface CreateCategoryData {
  name: string;
  type: "income" | "expense";
}

export interface UpdateCategoryData {
  name?: string;
}

export const getCategories = async (type?: "income" | "expense"): Promise<ActionResponse<Category[]>> => {
  try {
    const res = await api.get("/categories", { params: { type } });
    return { success: true, data: res.data || [] };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch categories",
    };
  }
};

export const getIncomeCategories = async (): Promise<ActionResponse<Category[]>> => {
  return getCategories("income");
};

export const getExpenseCategories = async (): Promise<ActionResponse<Category[]>> => {
  return getCategories("expense");
};

export const createCategory = async (data: CreateCategoryData): Promise<ActionResponse<Category>> => {
  try {
    const res = await api.post("/categories", data);
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to create category",
    };
  }
};

export const updateCategory = async (id: string, data: UpdateCategoryData): Promise<ActionResponse<Category>> => {
  try {
    const res = await api.patch(`/categories/${id}`, data);
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to update category",
    };
  }
};

export const reorderCategories = async (
  updates: { id: string; sortOrder: number }[],
): Promise<ActionResponse<void>> => {
  try {
    const res = await api.put("/categories/reorder", { updates });
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to reorder categories",
    };
  }
};

export const deleteCategory = async (id: string): Promise<ActionResponse<void>> => {
  try {
    const res = await api.delete(`/categories/${id}`);
    return { success: true, data: res.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to delete category",
    };
  }
};
