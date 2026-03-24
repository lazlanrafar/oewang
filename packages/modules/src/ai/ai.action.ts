"use server";

import { axiosInstance as api } from "../lib/axios.server";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: any;
}

export interface ChatData {
  sessionId?: string;
  reply: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  artifact?: {
    type: string;
    payload: any;
  };
}

export interface AiChatResponse {
  success: boolean;
  data?: ChatData;
  error?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  sessionId?: string,
  attachments?: { name: string; type: string; data: string }[],
): Promise<AiChatResponse> {
  try {
    const response = await api.post("/ai/chat", {
      messages,
      sessionId,
      attachments,
    });
    const apiResponse = (response as any)._api_response;
    const data = (apiResponse?.data ??
      response.data?.data ??
      response.data) as any;
    return { success: true, data: (data?.data ?? data) as ChatData };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message ?? "Failed to get AI response",
    };
  }
}

export async function getChatSessions(): Promise<{
  success: boolean;
  data?: ChatSession[];
  error?: string;
}> {
  try {
    const response = await api.get("/ai/sessions");
    const apiResponse = (response as any)._api_response;
    return {
      success: true,
      data: (apiResponse?.data ?? response.data?.data) as ChatSession[],
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message ?? "Failed to fetch chat sessions",
    };
  }
}

export async function getChatSessionMessages(
  sessionId: string,
): Promise<{ success: boolean; data?: ChatMessage[]; error?: string }> {
  try {
    const response = await api.get(`/ai/sessions/${sessionId}`);
    const apiResponse = (response as any)._api_response;
    return {
      success: true,
      data: (apiResponse?.data ?? response.data?.data) as ChatMessage[],
    };
  } catch (error: any) {
    return {
      success: false,
      error:
        error.response?.data?.message ?? "Failed to fetch session messages",
    };
  }
}

export interface ParsedReceipt {
  amount: number;
  date: string;
  name: string;
  categoryId: string;
}

export async function parseReceipt(file: {
  name: string;
  type: string;
  data: string;
}): Promise<{ success: boolean; data?: ParsedReceipt; error?: string }> {
  try {
    const response = await api.post("/ai/parse-receipt", { file });
    const apiResponse = (response as any)._api_response;
    return {
      success: true,
      data: (apiResponse?.data ?? response.data?.data) as ParsedReceipt,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message ?? "Failed to parse receipt",
    };
  }
}
