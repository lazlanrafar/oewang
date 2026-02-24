"use server";

import { axiosInstance as api } from "@/lib/axios";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatData {
  reply: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AiChatResponse {
  success: boolean;
  data?: ChatData;
  error?: string;
}

export async function sendChatMessage(
  messages: ChatMessage[],
): Promise<AiChatResponse> {
  try {
    const response = await api.post("/ai/chat", { messages });
    const apiResponse = (response as any)._api_response;
    if (apiResponse?.data) {
      return { success: true, data: apiResponse.data as ChatData };
    }
    // Fallback if interceptor didn't wrap it
    const data = (response.data as any)?.data ?? response.data;
    return { success: true, data: data as ChatData };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message ?? "Failed to get AI response",
    };
  }
}
