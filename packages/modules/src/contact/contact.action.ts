"use server";

import type { ActionResponse, Contact } from "@workspace/types";
import { axiosInstance as api } from "../lib/axios.server";

export const getContacts = async (filters?: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<ActionResponse<Contact[]>> => {
  try {
    const res = await api.get("/contacts", { params: filters });
    return { success: true, data: res.data?.data || [] };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch contacts",
    };
  }
};

export const getContact = async (id: string): Promise<ActionResponse<Contact>> => {
  try {
    const res = await api.get(`/contacts/${id}`);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch contact",
    };
  }
};

export const createContact = async (data: {
  name: string;
  email?: string | null;
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
  billingEmails?: string[] | null;
}): Promise<ActionResponse<Contact>> => {
  try {
    const res = await api.post("/contacts", data);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to create contact",
    };
  }
};

export const updateContact = async (
  id: string,
  data: {
    name?: string;
    email?: string | null;
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
    billingEmails?: string[] | null;
  }
): Promise<ActionResponse<Contact>> => {
  try {
    const res = await api.patch(`/contacts/${id}`, data);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to update contact",
    };
  }
};

export const deleteContact = async (id: string): Promise<ActionResponse<void>> => {
  try {
    const res = await api.delete(`/contacts/${id}`);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to delete contact",
    };
  }
};
