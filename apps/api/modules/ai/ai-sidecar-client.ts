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
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    log.error("sidecar call failed", { path, status: res.status, text });
    throw new Error(`AI sidecar ${path} failed (${res.status})`);
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

  /** Extract + chunk + embed a document for RAG. Caller writes vault_file_chunks. */
  static async chunkFile(
    base64: string,
    mimeType: string,
    fileName: string,
  ): Promise<{ indexable: boolean; chunks: SidecarChunk[] }> {
    return sidecarPost("/vault/chunk", { data: base64, mimeType, fileName });
  }

  /**
   * Run the LLM tool loop in the Python sidecar (WhatsApp/Telegram + in-process
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
    artifact?: { type: string; payload: any } | null;
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
