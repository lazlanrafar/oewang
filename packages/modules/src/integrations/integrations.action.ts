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

export async function getWhatsAppWebStatusAction(): Promise<ActionResponse<{
  status: string;
  qrCode?: string;
  phoneNumber?: string;
  connectedAt?: string;
  error?: string;
}>> {
  try {
    const res = await api.get("/integrations/whatsapp-web/status");
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to get WhatsApp Web status",
    };
  }
}

export async function startWhatsAppWebSessionAction(): Promise<ActionResponse<{
  status: string;
  qrCode?: string;
  phoneNumber?: string;
  connectedAt?: string;
  error?: string;
}>> {
  try {
    const res = await api.post("/integrations/whatsapp-web/start");
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to start WhatsApp Web session",
    };
  }
}

export async function disconnectWhatsAppWebSessionAction(): Promise<ActionResponse<null>> {
  try {
    await api.post("/integrations/whatsapp-web/disconnect");
    return { success: true, data: null };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to disconnect WhatsApp Web session",
    };
  }
}

export async function getWhatsAppWebPublicInfoAction(): Promise<ActionResponse<{ phoneNumber: string | null }>> {
  try {
    const res = await api.get("/integrations/whatsapp-web/public-info");
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to get WhatsApp Web public info",
    };
  }
}
