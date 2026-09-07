import { Env } from "@workspace/constants";
import { Elysia, t } from "elysia";
import { RealtimeService } from "../realtime/realtime.service";
import { SettingsRepository } from "../settings/settings.repository";
import { AgentSettingsService } from "./agent-settings.service";
import { buildSystemPrompt } from "./ai.prompts";

// Internal, service-to-service surface for the Python AI sidecar. NOT behind the
// JWT authPlugin. The chat money path (session, receipt-draft short-circuit,
// quota, chat_begin/chat_end) now runs entirely in-process in apps/ai — this
// controller only keeps what apps/ai still needs to reach TS for: the system
// prompt and the usage-notify fire-and-forget call. Guarded by the shared
// AI_SERVICE_API_KEY. # ponytail: shared-secret gate; only the sidecar holds the key.
export const aiInternalController = new Elysia({ prefix: "/ai/internal" })
  .onBeforeHandle(({ headers, set }) => {
    const expected = Env.AI_SERVICE_API_KEY;
    // Fail closed: no key configured -> reject everything (never disable auth).
    if (!expected || headers["x-api-key"] !== expected) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
  })
  .get(
    "/system-prompt",
    async ({ query }) => {
      const workspaceId = query.workspace_id;
      const agentSettings = await AgentSettingsService.getCached(workspaceId);
      let currencyCode = "IDR";
      let currencySymbol = "Rp";
      try {
        const wsSettings =
          await SettingsRepository.findByWorkspaceId(workspaceId);
        currencyCode = (wsSettings as any)?.mainCurrencyCode || currencyCode;
        currencySymbol =
          (wsSettings as any)?.mainCurrencySymbol || currencySymbol;
      } catch {}

      const system_prompt = buildSystemPrompt({
        currencyCode,
        currencySymbol,
        customInstructions: agentSettings.customInstructions ?? undefined,
        responseLanguage: agentSettings.responseLanguage,
      });
      return { system_prompt };
    },
    {
      query: t.Object({ workspace_id: t.String() }),
      detail: {
        summary: "Build website system prompt (internal)",
        tags: ["AI"],
      },
    },
  )
  // Fire-and-forget from the sidecar's chat_end_core: RealtimeService is an
  // in-process EventEmitter, so Python (a separate process) can't notify
  // connected WebSocket clients directly. Trusts x-api-key + explicit
  // workspace_id (service-to-service, same model /draft/* uses on the sidecar).
  .post(
    "/notify-usage",
    async ({ body }) => {
      RealtimeService.notifyValueChange(body.workspace_id, body.type);
      return { ok: true };
    },
    {
      body: t.Object({
        workspace_id: t.String(),
        type: t.String(),
      }),
      detail: { summary: "Notify usage change (internal sidecar)", tags: ["AI"] },
    },
  );
