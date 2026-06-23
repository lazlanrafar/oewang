import { Env } from "@workspace/constants";
import { logger } from "@workspace/logger";

export type SidecarChatResult = { reply: string; sessionId?: string };

/**
 * Calls the Python AI service (apps/ai) /chat endpoint.
 * Returns null when AI_SERVICE_URL is unset or the call fails, so the caller
 * can fall back to the in-process AiService.chat without breaking the flow.
 */
export async function chatViaSidecar(
  text: string,
  workspaceId: string,
  userId: string | null | undefined,
  sessionId?: string,
): Promise<SidecarChatResult | null> {
  const baseUrl = Env.AI_SERVICE_URL;
  if (!baseUrl) return null;

  try {
    const res = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(Env.AI_SERVICE_API_KEY
          ? { "x-api-key": Env.AI_SERVICE_API_KEY }
          : {}),
      },
      body: JSON.stringify({
        message: text,
        workspace_id: workspaceId,
        user_id: userId ?? undefined,
        session_id: sessionId,
      }),
    });

    if (!res.ok) {
      logger.error("AI sidecar chat failed", { status: res.status });
      return null;
    }

    const data = (await res.json()) as { reply: string; session_id?: string };
    return { reply: data.reply, sessionId: data.session_id ?? sessionId };
  } catch (err) {
    logger.error("AI sidecar chat error", { err });
    return null;
  }
}
