"use server";

import { axiosInstance as api } from "../lib/axios.server";
import type { ActionResponse } from "@workspace/types";

export async function connectWhatsAppAction(
  phoneNumber: string,
): Promise<ActionResponse<any>> {
  try {
    const res = await api.post("/integrations/whatsapp/connect", {
      phoneNumber,
    });
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to connect WhatsApp",
    };
  }
}

export async function getIntegrationsAction(): Promise<ActionResponse<any[]>> {
  try {
    const res = await api.get("/integrations");
    return { success: true, data: res.data?.data || [] };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch integrations",
    };
  }
}

export async function disconnectIntegrationAction(
  provider: string,
): Promise<ActionResponse<any>> {
  try {
    const res = await api.post(`/integrations/${provider}/disconnect`);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to disconnect integration",
    };
  }
}

