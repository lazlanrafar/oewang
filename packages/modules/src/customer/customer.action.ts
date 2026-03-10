"use server";

import type { ActionResponse, Customer } from "@workspace/types";
import { axiosInstance as api } from "../lib/axios.server";

export interface CreateCustomerData {
  name: string;
  email: string;
  phone?: string | null;
  website?: string | null;
  contact?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zip?: string | null;
  note?: string | null;
  vatNumber?: string | null;
}

export interface UpdateCustomerData extends Partial<CreateCustomerData> {}

export interface GetCustomersParams {
  page?: number;
  limit?: number;
  search?: string;
}

export const getCustomers = async (
  params?: GetCustomersParams,
): Promise<ActionResponse<Customer[]>> => {
  try {
    const res = await api.get("/customers", { params });
    return { success: true, data: res.data?.data || [] };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch customers",
    };
  }
};

export const getCustomerById = async (
  id: string,
): Promise<ActionResponse<Customer>> => {
  try {
    const res = await api.get(`/customers/${id}`);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch customer",
    };
  }
};

export const createCustomer = async (
  data: CreateCustomerData,
): Promise<ActionResponse<Customer>> => {
  try {
    const res = await api.post("/customers", data);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to create customer",
    };
  }
};

export const updateCustomer = async (
  id: string,
  data: UpdateCustomerData,
): Promise<ActionResponse<Customer>> => {
  try {
    const res = await api.put(`/customers/${id}`, data);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to update customer",
    };
  }
};

export const deleteCustomer = async (
  id: string,
): Promise<ActionResponse<void>> => {
  try {
    await api.delete(`/customers/${id}`);
    return { success: true, data: undefined };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to delete customer",
    };
  }
};
