import {
  buildSystemPrompt,
  ContextRepository,
  EmbeddingService,
  RagRepository,
} from "@workspace/ai";
import { Env } from "@workspace/constants";
import { createLogger } from "@workspace/logger";
import { Elysia, t } from "elysia";
import { SettingsRepository } from "../settings/settings.repository";
import { AgentSettingsService } from "./agent-settings.service";
import { executeAiTool } from "./ai.tools";

const log = createLogger("ai-internal");

// Maps an analysis tool to its canvas type + the threshold that decides whether
// a chart is worth rendering. Single source of truth for the website's artifact
// rules — mirrors the orchestrator's onArtifact() calls so the Python sidecar
// stays canvas-agnostic and just forwards whatever artifact we return.
const ARTIFACT_MAP: Record<string, { type: string; ok: (p: any) => boolean }> =
  {
    getSpendingAnalysis: {
      type: "spending-canvas",
      ok: (p) => Number(p?.metrics?.totalSpending ?? 0) > 0,
    },
    getRevenueSummary: {
      type: "revenue-canvas",
      ok: (p) => Number(p?.metrics?.totalRevenue ?? 0) > 0,
    },
    getBurnRate: {
      type: "burn-rate-canvas",
      ok: (p) => Number(p?.metrics?.avgMonthlyBurn ?? 0) > 0,
    },
    getDebtAnalysis: {
      type: "debt-canvas",
      ok: (p) => Number(p?.metrics?.count ?? 0) > 0,
    },
    getBudgetStatus: {
      type: "budget-canvas",
      ok: (p) => Array.isArray(p?.budgets) && p.budgets.length > 0,
    },
  };

function artifactFor(toolName: string, result: any) {
  const def = ARTIFACT_MAP[toolName];
  if (!def) return null;
  const payload = result?.data ?? result;
  return def.ok(payload) ? { type: def.type, payload } : null;
}

// Dispatches the full tool surface the website orchestrator exposes. The
// context/RAG tools run inline in the TS orchestrator (not executeAiTool), so we
// reuse the same packages/ai code here; everything else falls through to
// executeAiTool. No redis cache on the context tools.
// ponytail: skip the context-tool redis cache — add if these get hot.
async function executeInternalTool(
  toolName: string,
  input: any,
  workspaceId: string,
  userId: string,
): Promise<any> {
  switch (toolName) {
    case "get_workspace_context": {
      const [settings, wallets, categories] = await Promise.all([
        ContextRepository.getWorkspaceSettings(workspaceId),
        ContextRepository.getWalletSummary(workspaceId),
        ContextRepository.getCategories(workspaceId),
      ]);
      return { settings, wallets, categories };
    }
    case "get_recent_transactions":
      return ContextRepository.getRecentTransactions(
        workspaceId,
        input?.limit ?? 20,
        input?.from ?? undefined,
        input?.to ?? undefined,
      );
    case "get_outstanding_debts":
      return ContextRepository.getOutstandingDebts(workspaceId);
    case "search_documents": {
      if (!Env.OPENAI_API_KEY)
        return { error: "Document search requires an OpenAI API key." };
      const embedding = await EmbeddingService.embedQuery(
        input.query,
        Env.OPENAI_API_KEY,
      );
      const results = await RagRepository.similaritySearch(
        workspaceId,
        embedding,
        input?.limit ?? 5,
      );
      if (!results.length)
        return { message: "No relevant documents found for this query." };
      return {
        results: results.map((r: any) => ({
          fileName: r.fileName,
          excerpt: r.content,
          relevance: Math.round(r.similarity * 100),
        })),
      };
    }
    default:
      return executeAiTool(toolName, input, workspaceId, userId);
  }
}

// Internal, service-to-service surface for the Python AI sidecar. NOT behind the
// JWT authPlugin — the Python orchestrator drives the LLM loop and calls back
// here for tool execution + the system prompt, so the money path (DB writes,
// audit logs, analytics) stays in TS. Guarded by the shared AI_SERVICE_API_KEY.
// ponytail: shared-secret gate; only the sidecar holds the key.
export const aiInternalController = new Elysia({ prefix: "/ai/internal" })
  .onBeforeHandle(({ headers, set }) => {
    const expected = Env.AI_SERVICE_API_KEY;
    if (expected && headers["x-api-key"] !== expected) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
  })
  .post(
    "/execute-tool",
    async ({ body, set }) => {
      const { tool, input, workspace_id, user_id } = body;
      try {
        const result = await executeInternalTool(
          tool,
          input ?? {},
          workspace_id,
          user_id,
        );
        return { result, artifact: artifactFor(tool, result) };
      } catch (error: any) {
        log.error("Internal tool execution failed", {
          tool,
          error: error?.message ?? String(error),
        });
        set.status = 500;
        return { error: error?.message ?? "Tool execution failed" };
      }
    },
    {
      body: t.Object({
        tool: t.String(),
        input: t.Optional(t.Any()),
        workspace_id: t.String(),
        user_id: t.String(),
      }),
      detail: { summary: "Execute AI tool (internal sidecar)", tags: ["AI"] },
    },
  )
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
  );
