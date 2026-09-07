import { Env } from "@workspace/constants";
import { createLogger } from "@workspace/logger";

const log = createLogger("ai-sidecar-client");

/**
 * HTTP client for the Python AI sidecar (apps/ai). All AI logic — receipt OCR,
 * CSV/XLSX extraction, vault chunking, the chat tool loop, and the canvas tool
 * schemas — lives there now (packages/ai was removed). These endpoints are gated
 * by the shared AI_SERVICE_API_KEY and are required: if AI_SERVICE_URL is unset the
 * AI features are unavailable (there is no in-process fallback anymore).
 */
function sidecarBase(): string {
  const base = Env.AI_SERVICE_URL;
  if (!base) {
    throw new Error(
      "AI_SERVICE_URL is not set — the Python AI sidecar (apps/ai) is required for AI features.",
    );
  }
  return base.replace(/\/$/, "");
}

async function sidecarPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${sidecarBase()}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(Env.AI_SERVICE_API_KEY
        ? { "x-api-key": Env.AI_SERVICE_API_KEY }
        : {}),
    },
    body: JSON.stringify(body),
    // Chat tool-loops and receipt OCR are legitimately slow, but a wedged
    // sidecar must not pin API workers forever.
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    log.error("sidecar call failed", { path, status: res.status, text });
    const error = new Error(`AI sidecar ${path} failed (${res.status})`);
    // Attach the raw status/body so callers that need to tell "quota
    // exceeded" (422 PLAN_LIMIT_REACHED) apart from "sidecar is down" don't
    // have to re-parse .message. Additive — existing catch sites only read
    // .message and are unaffected.
    Object.assign(error, {
      status: res.status,
      body: (() => {
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      })(),
    });
    throw error;
  }
  return (await res.json()) as T;
}

export type SidecarParsedReceipt = {
  amount: number;
  date: string;
  name: string;
  // Typed as string (the model returns a category id or null); call sites that
  // pass it to a transaction treat a missing id as "uncategorized". Matches the
  // former @workspace/ai ParsedReceipt so this is a drop-in replacement.
  categoryId: string;
  items: {
    name: string;
    brand: string | null;
    quantity: number | null;
    unit: string | null;
    unitPrice: number | null;
    amount: number;
    categoryId: string | null;
  }[];
};

export type SidecarExtractedTransaction = {
  name: string;
  amount: number;
  date: string;
  type: "income" | "expense" | "transfer";
  walletName: string | null;
  categoryName: string | null;
  description: string | null;
};

export type SidecarChunk = {
  content: string;
  index: number;
  tokenCount: number;
  embedding?: number[];
};

export type SidecarRowReviewResult = {
  index: number;
  field: "category" | "type";
  suggestedValue: string;
  reason: string;
  confidence: number | null;
};

export type SidecarAnomalyCandidate = {
  index: number;
  reason: string;
  severity: string;
};

export abstract class AiSidecarClient {
  /** Parse a receipt image/PDF → structured transaction + line items.
   * workspaceId makes the sidecar quota-check and meter the vision call. */
  static async parseReceipt(
    base64: string,
    mimeType: string,
    categoryContext: string,
    workspaceId: string,
  ): Promise<SidecarParsedReceipt | null> {
    const { parsed } = await sidecarPost<{
      parsed: SidecarParsedReceipt | null;
    }>("/receipt/parse", {
      file: { data: base64, type: mimeType },
      categoryContext,
      workspace_id: workspaceId,
    });
    return parsed;
  }

  /** Extract transactions from a raw CSV/XLSX file (Python parses the rows). */
  static async extractTransactions(
    base64: string,
    mimeType: string,
    walletNames: string[],
    categoryNames: string[],
    workspaceId: string,
  ): Promise<SidecarExtractedTransaction[]> {
    const { transactions } = await sidecarPost<{
      transactions: SidecarExtractedTransaction[];
    }>("/import/extract", {
      data: base64,
      mimeType,
      walletNames,
      categoryNames,
      workspace_id: workspaceId,
    });
    return transactions;
  }

  /** Review already-mapped import rows: category suggestions for blank rows +
   * type/sign mismatch flags. Distinct from extractTransactions, which reads
   * raw file bytes — this reviews rows the CSV wizard already built. */
  static async reviewTransactionRows(
    rows: {
      index: number;
      name: string | null;
      description: string | null;
      amount: number;
      type: string;
      hasCategoryId: boolean;
    }[],
    categoryNames: string[],
    workspaceId: string,
  ): Promise<{ results: SidecarRowReviewResult[]; reviewedCount: number }> {
    return sidecarPost("/import/review-rows", {
      rows,
      categoryNames,
      workspace_id: workspaceId,
    });
  }

  /** Score NEW (not-yet-persisted) expense rows against the workspace's
   * existing transaction history via the same IsolationForest model the
   * scheduled anomaly scan uses. No LLM call, no quota cost. */
  static async detectAnomalyCandidates(
    candidates: {
      index: number;
      amount: number;
      date: string;
      category: string | null;
    }[],
    workspaceId: string,
  ): Promise<SidecarAnomalyCandidate[]> {
    const { anomalies } = await sidecarPost<{
      anomalies: SidecarAnomalyCandidate[];
    }>("/anomaly/candidates", {
      candidates,
      workspace_id: workspaceId,
    });
    return anomalies;
  }

  /** Extract + chunk + embed a document for RAG. Caller writes vault_file_chunks. */
  static async chunkFile(
    base64: string,
    mimeType: string,
    fileName: string,
  ): Promise<{ indexable: boolean; chunks: SidecarChunk[] }> {
    return sidecarPost("/vault/chunk", { data: base64, mimeType, fileName });
  }

  /**
   * Run the LLM tool loop in the Python sidecar (Telegram + in-process
   * fallback). Elysia builds the prompt/history and persists the reply; the loop
   * + tool execution happen in Python.
   */
  static async runChat(
    systemPrompt: string,
    history: { role: string; content: string; attachments?: any }[],
    workspaceId: string,
    userId: string,
    webSearch?: boolean,
  ): Promise<{
    reply: string;
    usage?: { input_tokens: number; output_tokens: number };
    artifacts?: { type: string; payload: any }[];
    response_id?: string;
  }> {
    return sidecarPost("/chat/run", {
      system_prompt: systemPrompt,
      history,
      workspace_id: workspaceId,
      user_id: userId,
      web_search: webSearch ?? false,
    });
  }

  /** Run one AI tool (DB writes, audit, canvas) in the Python sidecar. */
  static async executeTool(
    tool: string,
    input: unknown,
    workspaceId: string,
    userId: string,
  ): Promise<{ result: any; artifact: { type: string; payload: any } | null }> {
    return sidecarPost("/tools/execute", {
      tool,
      input,
      workspace_id: workspaceId,
      user_id: userId,
    });
  }

  /** Short LLM-written session title. Cosmetic — callers must tolerate null
   * (quota exceeded, sidecar error) and keep the existing title. */
  static async generateTitle(
    message: string,
    workspaceId: string,
  ): Promise<string | null> {
    try {
      const { title } = await sidecarPost<{ title: string | null }>(
        "/chat/title",
        { message, workspace_id: workspaceId },
      );
      return title;
    } catch (error) {
      log.warn("title generation failed", { error });
      return null;
    }
  }

  /** Scan chat history for a pending receipt draft (Telegram's precedence
   * check before falling back to normal chat — same as web's chatBegin). */
  static async getLatestDraftState(
    history: { role: string; content: string; attachments?: any }[],
  ): Promise<Record<string, any> | null> {
    const { draft } = await sidecarPost<{ draft: Record<string, any> | null }>(
      "/draft/latest-state",
      { history },
    );
    return draft;
  }

  /** Handle a reply while a receipt draft awaits confirmation (confirm/
   * cancel/"account: X"). Returns null if the message doesn't fit any
   * recognized branch (caller should fall back to normal chat). */
  static async handlePendingInvoiceDraft(
    workspaceId: string,
    userId: string,
    message: { role: string; content: string },
    draft: Record<string, any>,
    sessionId: string,
  ): Promise<{ sessionId: string; reply: string } | null> {
    const { result } = await sidecarPost<{
      result: { sessionId: string; reply: string } | null;
    }>("/draft/handle-pending", {
      workspace_id: workspaceId,
      user_id: userId,
      message,
      draft,
      session_id: sessionId,
    });
    return result;
  }

  /** Build a receipt draft preview from new attachments (OCR + vault upload
   * happen inside this call, in the sidecar). Returns null if none of the
   * attachments were receipts or nothing could be parsed. */
  static async buildInvoiceDraftFromAttachments(
    workspaceId: string,
    userId: string,
    attachments: { name: string; type: string; data: string }[],
  ): Promise<{ reply: string; draft: Record<string, any> } | null> {
    const { result } = await sidecarPost<{
      result: { reply: string; draft: Record<string, any> } | null;
    }>("/draft/build-from-attachments", {
      workspace_id: workspaceId,
      user_id: userId,
      attachments,
    });
    return result;
  }

  /** The canonical AI tool schemas (for the MCP server to register at startup). */
  static async toolDefinitions(): Promise<any[]> {
    const res = await fetch(`${sidecarBase()}/tools/definitions`, {
      headers: Env.AI_SERVICE_API_KEY
        ? { "x-api-key": Env.AI_SERVICE_API_KEY }
        : {},
    });
    if (!res.ok)
      throw new Error(`AI sidecar /tools/definitions failed (${res.status})`);
    const { tools } = (await res.json()) as { tools: any[] };
    return tools;
  }
}
