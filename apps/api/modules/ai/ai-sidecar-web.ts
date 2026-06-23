import { Env } from "@workspace/constants";
import { createLogger } from "@workspace/logger";
import type { ChatResponse } from "./ai.dto";

const log = createLogger("ai-sidecar-web");

// Structural — accepts both the dto ChatMessage and the @workspace/ai one.
type ChatTurn = { role: string; content: string };

type SidecarWebResponse = Pick<
  ChatResponse,
  "reply" | "usage" | "artifact" | "provider"
>;

/**
 * Routes the website chat's LLM + tool loop through the Python sidecar
 * (apps/ai `/chat/web`). The sidecar drives the model and calls back into Elysia
 * for tool execution, so session persistence, title generation, quota and
 * dry-run all stay in AiService.chat around this call — we only swap the
 * orchestrator step.
 *
 * Active whenever AI_SERVICE_URL is set (same gate as the WhatsApp/Telegram
 * sidecar path). Returns null when the URL is unset or the call fails, so the
 * caller falls back to the in-process AiOrchestrator without breaking the chat —
 * the fallback is what keeps the canvas safe.
 */
export async function chatWebViaSidecar(
  messages: ChatTurn[],
  workspaceId: string,
  userId: string,
  systemPrompt: string,
  webSearch?: boolean,
  sessionId?: string,
): Promise<SidecarWebResponse | null> {
  const baseUrl = Env.AI_SERVICE_URL;
  if (!baseUrl) return null;

  try {
    const res = await fetch(`${baseUrl}/chat/web`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(Env.AI_SERVICE_API_KEY
          ? { "x-api-key": Env.AI_SERVICE_API_KEY }
          : {}),
      },
      body: JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        workspace_id: workspaceId,
        user_id: userId,
        session_id: sessionId,
        web_search: webSearch ?? false,
        system_prompt: systemPrompt,
      }),
    });

    if (!res.ok) {
      log.error("AI web sidecar failed", { status: res.status });
      return null;
    }

    const data = (await res.json()) as {
      reply: string;
      usage?: ChatResponse["usage"];
      artifact?: ChatResponse["artifact"];
      provider?: ChatResponse["provider"];
    };
    return {
      reply: data.reply,
      usage: data.usage,
      artifact: data.artifact,
      provider: data.provider,
    };
  } catch (err) {
    log.error("AI web sidecar error", { err });
    return null;
  }
}
