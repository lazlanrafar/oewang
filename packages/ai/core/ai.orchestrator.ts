import { generateText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { redis } from "@workspace/redis";
import { ChatMessage, ChatResponse, AgentSettings } from "../types";
import { ContextRepository } from "../context/context.repository";
import { log } from "../utils/logger";

export interface OrchestratorOptions {
  workspaceId: string;
  userId: string;
  openaiKey?: string;
  anthropicKey?: string;
  geminiKey?: string;
  settings?: AgentSettings;
}

export type ToolExecutorFn = (name: string, args: any) => Promise<any>;

const CONTEXT_CACHE_TTL = 300; // 5 min
const TRANSACTIONS_CACHE_TTL = 120; // 2 min
const DEBTS_CACHE_TTL = 120; // 2 min

function buildModel(options: OrchestratorOptions) {
  const modelId = options.settings?.model ?? "gpt-4o-mini";

  if (modelId.startsWith("claude-")) {
    if (!options.anthropicKey) throw new Error("Anthropic API key required for Claude models.");
    const provider = createAnthropic({ apiKey: options.anthropicKey });
    return provider(modelId as any);
  }

  if (!options.openaiKey) throw new Error("OpenAI API key required.");
  const provider = createOpenAI({ apiKey: options.openaiKey });
  return provider(modelId);
}

function toCoreMessages(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
}

function buildTools(
  workspaceId: string,
  executor: ToolExecutorFn,
  onArtifact: (type: string, payload: any) => void,
) {
  return {
    // ── Context / read tools ────────────────────────────────────────────────

    get_workspace_context: tool({
      description:
        "Get the user's current workspace context: all wallets with names and balances, all available categories (with IDs), and currency settings. Call this FIRST before creating transactions or answering balance questions. Results are cached for 5 minutes.",
      parameters: z.object({}),
      execute: async () => {
        const cacheKey = `oewang:ws-ctx:${workspaceId}`;
        try {
          const cached = await redis.get(cacheKey);
          if (cached) {
            log.debug("get_workspace_context: cache hit");
            return typeof cached === "string" ? JSON.parse(cached) : cached;
          }
        } catch {}

        const [settings, wallets, categories] = await Promise.all([
          ContextRepository.getWorkspaceSettings(workspaceId),
          ContextRepository.getWalletSummary(workspaceId),
          ContextRepository.getCategories(workspaceId),
        ]);

        const result = { settings, wallets, categories };

        try {
          await redis.set(cacheKey, JSON.stringify(result), { ex: CONTEXT_CACHE_TTL });
        } catch {}

        return result;
      },
    }),

    get_recent_transactions: tool({
      description:
        "Fetch recent transactions for the workspace. Use when the user asks about their spending history, specific past purchases, or recent activity.",
      parameters: z.object({
        limit: z.number().int().min(1).max(50).default(20).describe("Number of transactions to return (max 50)"),
        from: z.string().nullable().optional().describe("ISO date start filter, e.g. 2026-01-01"),
        to: z.string().nullable().optional().describe("ISO date end filter, e.g. 2026-06-30"),
      }),
      execute: async ({ limit, from, to }) => {
        const cacheKey = `oewang:ws-txns:${workspaceId}:${limit}:${from ?? ""}:${to ?? ""}`;
        try {
          const cached = await redis.get(cacheKey);
          if (cached) return typeof cached === "string" ? JSON.parse(cached) : cached;
        } catch {}

        const txns = await ContextRepository.getRecentTransactions(workspaceId, limit ?? 20, from ?? undefined, to ?? undefined);

        try {
          await redis.set(cacheKey, JSON.stringify(txns), { ex: TRANSACTIONS_CACHE_TTL });
        } catch {}

        return txns;
      },
    }),

    get_outstanding_debts: tool({
      description:
        "Fetch all unpaid debts and receivables for the workspace. Use when the user asks about money they owe or is owed.",
      parameters: z.object({}),
      execute: async () => {
        const cacheKey = `oewang:ws-debts:${workspaceId}`;
        try {
          const cached = await redis.get(cacheKey);
          if (cached) return typeof cached === "string" ? JSON.parse(cached) : cached;
        } catch {}

        const debts = await ContextRepository.getOutstandingDebts(workspaceId);

        try {
          await redis.set(cacheKey, JSON.stringify(debts), { ex: DEBTS_CACHE_TTL });
        } catch {}

        return debts;
      },
    }),

    // ── Transaction mutation tools ──────────────────────────────────────────

    create_transaction: tool({
      description: "Create a new financial transaction (income, expense, or transfer). Call get_workspace_context first to get real wallet and category IDs.",
      parameters: z.object({
        type: z.enum(["income", "expense", "transfer"]).describe("Transaction type."),
        amount: z.number().positive().describe("Amount. Must be confirmed with the user."),
        date: z.string().nullable().optional().describe("ISO date string. Defaults to today if null."),
        name: z.string().describe("Name or merchant (e.g. 'Starbucks')."),
        walletId: z.string().describe("Source wallet ID (use ID from get_workspace_context, not name)."),
        toWalletId: z.string().nullable().optional().describe("Destination wallet ID — required for transfers only."),
        categoryId: z.string().nullable().optional().describe("Category ID (use ID from get_workspace_context)."),
        description: z.string().nullable().optional().describe("Optional notes."),
      }),
      execute: async (args) => {
        const result = await executor("create_transaction", args);
        // Bust context cache so balances refresh on next call
        try { await redis.del(`oewang:ws-ctx:${workspaceId}`); } catch {}
        try { await redis.del(`oewang:ws-txns:${workspaceId}:20::`.split(":")[0]!); } catch {}
        return result;
      },
    }),

    update_transaction: tool({
      description: "Update an existing transaction's fields.",
      parameters: z.object({
        id: z.string().describe("Transaction ID to update."),
        amount: z.number().positive().nullable().optional().describe("New amount."),
        name: z.string().nullable().optional().describe("New name/merchant."),
        categoryId: z.string().nullable().optional().describe("New category ID."),
        description: z.string().nullable().optional().describe("New notes."),
      }),
      execute: async (args) => executor("update_transaction", args),
    }),

    delete_transaction: tool({
      description: "Delete (soft-delete) a transaction by ID.",
      parameters: z.object({
        id: z.string().describe("Transaction ID to delete."),
      }),
      execute: async (args) => {
        const result = await executor("delete_transaction", args);
        try { await redis.del(`oewang:ws-ctx:${workspaceId}`); } catch {}
        return result;
      },
    }),

    // ── Debt tools ──────────────────────────────────────────────────────────

    create_debt: tool({
      description: "Record a debt (hutang/payable) or receivable (piutang). Use 'payable' when user owes money, 'receivable' when someone owes the user.",
      parameters: z.object({
        contactName: z.string().describe("Name of the person involved."),
        type: z.enum(["payable", "receivable"]).describe("payable = user owes them; receivable = they owe the user."),
        amount: z.number().positive().describe("Debt amount."),
        description: z.string().nullable().optional().describe("Optional description."),
        dueDate: z.string().nullable().optional().describe("Optional due date (ISO string)."),
      }),
      execute: async (args) => executor("create_debt", args),
    }),

    split_bill: tool({
      description: "Create an expense transaction and split it equally with others. Auto-records receivable debts for each participant.",
      parameters: z.object({
        amount: z.number().positive().describe("Total amount paid."),
        name: z.string().describe("Transaction name/merchant."),
        walletId: z.string().describe("Wallet ID to deduct from (use ID from get_workspace_context)."),
        categoryId: z.string().nullable().optional().describe("Category ID."),
        contactNames: z.array(z.string()).describe("Names of everyone the bill is split with."),
      }),
      execute: async (args) => {
        const result = await executor("split_bill", args);
        try { await redis.del(`oewang:ws-ctx:${workspaceId}`); } catch {}
        return result;
      },
    }),

    // ── Analysis tools ──────────────────────────────────────────────────────

    getRevenueSummary: tool({
      description: "Analyze income/revenue — totals, monthly trends, and growth. A chart renders automatically; just write a text summary.",
      parameters: z.object({
        period: z
          .enum(["3-months", "6-months", "this-year", "1-year", "last-12-months", "year-to-date", "last-year"])
          .nullable()
          .optional()
          .describe("Predefined period. Use from/to for custom ranges."),
        from: z.string().nullable().optional().describe("ISO date-time start."),
        to: z.string().nullable().optional().describe("ISO date-time end."),
        currency: z.string().nullable().optional().describe("Currency code override."),
        showCanvas: z.boolean().nullable().optional().describe("Whether to show the visual chart."),
      }),
      execute: async (args) => {
        const result = await executor("getRevenueSummary", args);
        const payload = result?.data ?? result;
        if (Number(payload?.metrics?.totalRevenue ?? 0) > 0) {
          onArtifact("revenue-canvas", payload);
        }
        return result;
      },
    }),

    getBurnRate: tool({
      description: "Calculate monthly burn rate (expense rate) and financial runway. A chart renders automatically; just write a text summary.",
      parameters: z.object({
        period: z
          .enum(["3-months", "6-months", "1-year", "last-6-months", "last-12-months", "year-to-date"])
          .nullable()
          .optional()
          .describe("Predefined period."),
        from: z.string().nullable().optional().describe("ISO date-time start."),
        to: z.string().nullable().optional().describe("ISO date-time end."),
        currency: z.string().nullable().optional().describe("Currency code override."),
        showCanvas: z.boolean().nullable().optional().describe("Whether to show the visual chart."),
      }),
      execute: async (args) => {
        const result = await executor("getBurnRate", args);
        const payload = result?.data ?? result;
        if (Number(payload?.metrics?.avgMonthlyBurn ?? 0) > 0) {
          onArtifact("burn-rate-canvas", payload);
        }
        return result;
      },
    }),

    getSpendingAnalysis: tool({
      description: "Analyze spending patterns and category breakdown. A chart renders automatically; just write a text summary.",
      parameters: z.object({
        period: z
          .enum(["this-month", "last-month", "last-3-months", "this-year", "year-to-date", "last-year", "last-12-months"])
          .nullable()
          .optional()
          .describe("Predefined period."),
        from: z.string().nullable().optional().describe("ISO date-time start."),
        to: z.string().nullable().optional().describe("ISO date-time end."),
        currency: z.string().nullable().optional().describe("Currency code override."),
        showCanvas: z.boolean().nullable().optional().describe("Whether to show the visual chart."),
      }),
      execute: async (args) => {
        const result = await executor("getSpendingAnalysis", args);
        const payload = result?.data ?? result;
        if (Number(payload?.metrics?.totalSpending ?? 0) > 0) {
          onArtifact("spending-canvas", payload);
        }
        return result;
      },
    }),

    // ── Item tools ──────────────────────────────────────────────────────────

    add_transaction_items: tool({
      description: "Add purchased line items to an existing transaction after parsing a receipt. Always call this immediately after create_transaction when items are present.",
      parameters: z.object({
        transactionId: z.string().describe("ID of the transaction to attach items to."),
        items: z
          .array(
            z.object({
              name: z.string().describe("Product name."),
              brand: z.string().nullable().optional().describe("Brand name."),
              quantity: z.number().nullable().optional().describe("Quantity purchased."),
              unit: z.string().nullable().optional().describe("Unit: pcs, kg, g, ml, L."),
              unitPrice: z.number().nullable().optional().describe("Price per unit."),
              amount: z.number().describe("Total line amount."),
              categoryId: z.string().nullable().optional().describe("Category ID for this item."),
            }),
          )
          .describe("Items from the receipt."),
      }),
      execute: async (args) => executor("add_transaction_items", args),
    }),

    search_transaction_items: tool({
      description: "Search purchase history by product name or brand. Use for queries like 'when did I last buy X?' or 'how much do I spend on shampoo?'",
      parameters: z.object({
        query: z.string().describe("Item name or brand to search (e.g. 'Dove Soap', 'shampoo')."),
        limit: z.number().int().nullable().optional().describe("Max results (default 10)."),
      }),
      execute: async (args) => executor("search_transaction_items", args),
    }),
  };
}

export abstract class AiOrchestrator {
  static async chat(
    messages: ChatMessage[],
    options: OrchestratorOptions,
    executor: ToolExecutorFn,
    systemPrompt: string,
  ): Promise<ChatResponse> {
    let capturedArtifact: { type: string; payload: any } | undefined;

    const model = buildModel(options);
    const tools = buildTools(options.workspaceId, executor, (type, payload) => {
      capturedArtifact = { type, payload };
    });

    const result = await generateText({
      model,
      system: systemPrompt,
      messages: toCoreMessages(messages),
      tools,
      maxSteps: options.settings?.maxSteps ?? 10,
      temperature: options.settings?.temperature ?? 0.7,
    });

    return {
      reply: result.text,
      usage: {
        input_tokens: result.usage.promptTokens,
        output_tokens: result.usage.completionTokens,
      },
      artifact: capturedArtifact,
    };
  }

  static async generateTitle(message: string, openaiKey?: string, anthropicKey?: string): Promise<string> {
    try {
      if (openaiKey) {
        const provider = createOpenAI({ apiKey: openaiKey });
        const result = await generateText({
          model: provider("gpt-4o-mini"),
          prompt: `Generate a short title (4-6 words) for a finance chat that starts with: "${message.slice(0, 200)}". Return only the title, no quotes.`,
          maxTokens: 20,
        });
        return result.text.trim().replace(/["']/g, "") || "New Chat";
      }

      if (anthropicKey) {
        const provider = createAnthropic({ apiKey: anthropicKey });
        const result = await generateText({
          model: provider("claude-3-5-haiku-20241022"),
          prompt: `Generate a short title (4-6 words) for a finance chat that starts with: "${message.slice(0, 200)}". Return only the title, no quotes.`,
          maxTokens: 20,
        });
        return result.text.trim().replace(/["']/g, "") || "New Chat";
      }
    } catch (e: any) {
      log.warn("Title generation failed", { error: e?.message });
    }

    return "New Chat";
  }
}
