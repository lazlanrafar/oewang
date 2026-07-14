"use server";

import { Env } from "@workspace/constants";
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
  code?: string;
  meta?: any;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
}

export interface AiQuota {
  used: number;
  maxTokens: number;
  plan_current_period_end: string | null;
  created_at: string;
}

/**
 * Direct web→ai path: calls the Python sidecar straight from this server action,
 * so Elysia is freed from holding the long multi-step LLM request. Identity is the
 * user's session JWT (resolved server-side, never from the client); Python calls
 * Elysia internal endpoints for tools + the money path (session, quota, token
 * usage), so billing stays exact and server-side.
 *
 * Returns null ONLY when the sidecar is unset or unreachable (network error), so
 * the caller transparently falls back to the in-process /ai/chat path. Any HTTP
 * response — 4xx (quota/auth) or 5xx — is surfaced, never retried: chat_begin may
 * have already created the session, so falling back would duplicate it and
 * re-spend tokens.
 */
async function chatViaPythonDirect(
  messages: ChatMessage[],
  sessionId?: string,
  webSearch?: boolean,
): Promise<AiChatResponse | null> {
  const baseUrl = Env.AI_SERVICE_URL;
  if (!baseUrl) return null;

  let token: string | undefined;
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const cookieName = Env.NEXT_PUBLIC_SESSION_COOKIE_NAME || "oewang-session";
    token = cookieStore.get(cookieName)?.value;
  } catch {}
  if (!token) return null; // no session → let the encrypted api path handle auth

  try {
    const res = await fetch(`${baseUrl}/chat/web`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(Env.AI_SERVICE_API_KEY
          ? { "x-api-key": Env.AI_SERVICE_API_KEY }
          : {}),
      },
      body: JSON.stringify({
        messages,
        session_id: sessionId,
        web_search: webSearch ?? false,
      }),
    });

    const body = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      // Reachable but errored (quota/auth/5xx) → surface; do NOT fall back, or we
      // risk a duplicate session + double token spend from a partial chat_begin.
      return {
        success: false,
        error: body?.message ?? "Failed to get AI response",
        code: body?.code,
        meta: body?.meta,
      };
    }

    return {
      success: true,
      data: {
        sessionId: body?.session_id,
        reply: body?.reply,
        usage: body?.usage,
        artifact: body?.artifact ?? undefined,
      } as ChatData,
    };
  } catch {
    return null; // network error → fall back
  }
}

export async function sendChatMessage(
  messages: ChatMessage[],
  sessionId?: string,
  attachments?: { name: string; type: string; data: string }[],
  webSearch?: boolean,
): Promise<AiChatResponse> {
  const messagesWithAttachments = [...messages];
  if (attachments && attachments.length > 0) {
    for (let i = messagesWithAttachments.length - 1; i >= 0; i--) {
      if (messagesWithAttachments[i]?.role === "user") {
        messagesWithAttachments[i] = {
          ...messagesWithAttachments[i]!,
          attachments,
        };
        break;
      }
    }
  }

  // Prefer the direct sidecar path; fall back to the in-process API on any miss.
  const direct = await chatViaPythonDirect(
    messagesWithAttachments,
    sessionId,
    webSearch,
  );
  if (direct) return direct;

  try {
    // AI endpoints run multi-step LLM loops — exempt from the 15s default.
    const response = await api.post(
      "/ai/chat",
      { messages: messagesWithAttachments, sessionId, webSearch },
      { timeout: 120_000 },
    );
    const apiResponse = (response as any)._api_response;
    const data = (apiResponse?.data ??
      response.data?.data ??
      response.data) as any;
    return { success: true, data: (data?.data ?? data) as ChatData };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message ?? "Failed to get AI response",
      code: error.response?.data?.code,
      meta: error.response?.data?.meta,
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

export async function getChatSession(
  sessionId: string,
): Promise<{ success: boolean; data?: ChatSession; error?: string }> {
  try {
    const response = await api.get(`/ai/sessions/${sessionId}/metadata`);
    const apiResponse = (response as any)._api_response;
    return {
      success: true,
      data: (apiResponse?.data ?? response.data?.data) as ChatSession,
    };
  } catch (error: any) {
    return {
      success: false,
      error:
        error.response?.data?.message ?? "Failed to fetch session metadata",
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
    const response = await api.post(
      "/ai/parse-receipt",
      { file },
      { timeout: 120_000 },
    );
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

export async function getAiQuota(): Promise<{
  success: boolean;
  data?: AiQuota;
  error?: string;
}> {
  try {
    const response = await api.get("/ai/quota");
    const apiResponse = (response as any)._api_response;
    return {
      success: true,
      data: (apiResponse?.data ?? response.data?.data) as AiQuota,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message ?? "Failed to fetch AI quota",
    };
  }
}

export async function updateAgentResponseLanguageAction(
  response_language: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await api.put("/ai/agent-settings", { response_language });
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error:
        error.response?.data?.message ?? "Failed to update response language",
    };
  }
}
