import { Env } from "@workspace/constants";
import { Elysia, t } from "elysia";
import { getAuth } from "../../plugins/auth";
import { SettingsRepository } from "../settings/settings.repository";
import { AgentSettingsService } from "./agent-settings.service";
import { buildSystemPrompt } from "./ai.prompts";
import { AiService } from "./ai.service";

// Internal, service-to-service surface for the Python AI sidecar. NOT behind the
// JWT authPlugin. Tool execution + the LLM loop now run IN the sidecar (the money
// path moved to Python); Elysia keeps only the identity/session/quota plumbing:
// the system prompt, and chat-begin/chat-end. Guarded by the shared
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
  // Pre-LLM money path for the direct web→ai flow. Identity comes from the user's
  // JWT (verified here via getAuth — authoritative workspace resolution), NOT from
  // the body, so the sidecar never has to hold the JWT secret. Quota/404 errors
  // throw and propagate as plain-JSON HTTP status (the encryption plugin exempts
  // /ai/internal), which the sidecar forwards to the browser unchanged.
  .post(
    "/chat-begin",
    async ({ body, headers, set }) => {
      const token = headers.authorization?.split(" ")[1];
      const auth = token ? await getAuth(token) : null;
      if (!auth) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const result = await AiService.chatBegin(
        body.messages as any,
        auth.workspace_id,
        auth.user_id,
        body.session_id ?? undefined,
      );
      if (result.kind === "early") {
        return {
          kind: "early",
          session_id: result.sessionId,
          reply: result.reply,
        };
      }
      return {
        kind: "ready",
        workspace_id: auth.workspace_id,
        user_id: auth.user_id,
        session_id: result.sessionId,
        system_prompt: result.systemPrompt,
        history: result.history,
        current_tokens: result.currentTokens,
      };
    },
    {
      body: t.Object({
        messages: t.Array(
          t.Object({
            role: t.String(),
            content: t.String(),
            attachments: t.Optional(t.Any()),
          }),
          { minItems: 1 },
        ),
        session_id: t.Optional(t.Nullable(t.String())),
        web_search: t.Optional(t.Boolean()),
      }),
      detail: { summary: "Begin chat (internal sidecar)", tags: ["AI"] },
    },
  )
  // Post-LLM money path: persist reply + increment tokens against the count read
  // at chat-begin. Trusts the sidecar (x-api-key) for workspace_id, same model as
  // execute-tool.
  .post(
    "/chat-end",
    async ({ body }) => {
      await AiService.chatEnd(
        body.workspace_id,
        body.session_id,
        {
          reply: body.reply,
          usage: body.usage,
          artifact: body.artifact,
          provider: body.provider,
        },
        body.current_tokens,
      );
      return { ok: true };
    },
    {
      body: t.Object({
        workspace_id: t.String(),
        session_id: t.String(),
        reply: t.String(),
        usage: t.Optional(t.Any()),
        artifact: t.Optional(t.Any()),
        provider: t.Optional(t.Any()),
        current_tokens: t.Number(),
      }),
      detail: { summary: "End chat (internal sidecar)", tags: ["AI"] },
    },
  );
