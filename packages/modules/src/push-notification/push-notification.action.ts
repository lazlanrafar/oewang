"use server";

import { axiosInstance as api } from "../lib/axios.server";
import type { ActionResponse, ApiResponse } from "@workspace/types";

export const sendTestPush = async (input: {
  userId?: string;
  title: string;
  body: string;
}): Promise<ActionResponse<null>> => {
  try {
    await api.post("/device-tokens/test-send", {
      user_id: input.userId || undefined,
      title: input.title,
      body: input.body,
    });
    return { success: true, data: null };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to dispatch test push",
    };
  }
};

export const getPushClientStatus = async (
  userId?: string,
): Promise<
  ActionResponse<{ deviceTokens: number; webPushSubscriptions: number }>
> => {
  try {
    const response = await api.get("/device-tokens/status", {
      params: userId ? { user_id: userId } : undefined,
    });

    const apiResponse = (response as any)._api_response as
      | ApiResponse<{
          device_tokens: number;
          web_push_subscriptions: number;
        }>
      | undefined;

    const data = apiResponse?.data ?? response.data.data;
    if (!data) {
      return { success: false, error: "Failed to load push client status" };
    }

    return {
      success: true,
      data: {
        deviceTokens: data.device_tokens,
        webPushSubscriptions: data.web_push_subscriptions,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to load push client status",
    };
  }
};
