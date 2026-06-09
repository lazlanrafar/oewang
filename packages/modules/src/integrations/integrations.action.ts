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
      error:
        error.response?.data?.message || "Failed to disconnect integration",
    };
  }
}

export async function getGmailInstallUrlAction(): Promise<
  ActionResponse<{ url: string }>
> {
  try {
    const res = await api.get("/integrations/gmail/install-url");
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error:
        error.response?.data?.message || "Failed to get Gmail install URL",
    };
  }
}

export async function syncGmailAction(): Promise<ActionResponse<null>> {
  try {
    await api.post("/integrations/gmail/sync");
    return { success: true, data: null };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to sync Gmail",
    };
  }
}

export async function getOutlookInstallUrlAction(): Promise<
  ActionResponse<{ url: string }>
> {
  try {
    const res = await api.get("/integrations/outlook/install-url");
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error:
        error.response?.data?.message || "Failed to get Outlook install URL",
    };
  }
}

export async function syncOutlookAction(): Promise<ActionResponse<null>> {
  try {
    await api.post("/integrations/outlook/sync");
    return { success: true, data: null };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to sync Outlook",
    };
  }
}
