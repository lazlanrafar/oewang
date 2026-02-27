"use server";

import { axiosInstance as api } from "../lib/axios";
import type { ActionResponse } from "@workspace/types";

export async function connectWhatsAppAction(
  phoneNumber: string,
): Promise<ActionResponse<any>> {
  try {
    const { data } = await api.post("/integrations/whatsapp/connect", {
      phoneNumber,
    });
    return { success: true, data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to connect WhatsApp",
    };
  }
}

export async function getIntegrationsAction(): Promise<ActionResponse<any[]>> {
  try {
    const { data } = await api.get("/integrations");
    return { success: true, data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch integrations",
    };
  }
}
