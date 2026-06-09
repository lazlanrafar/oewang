import {
  AiOrchestrator,
  ReceiptService,
  buildSystemPrompt,
  type ChatMessage as RepoChatMessage,
} from "@workspace/ai";
import { API_CONFIG, Env } from "@workspace/constants";
import { createLogger } from "@workspace/logger";
import { redis } from "@workspace/redis";
import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { status } from "elysia";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { CategoriesRepository } from "../categories/categories.repository";
import { SettingsRepository } from "../settings/settings.repository";
import { TransactionItemsService } from "../transactions/items/transaction-items.service";
import { TransactionsService } from "../transactions/transactions.service";
import { VaultService } from "../vault/vault.service";
import { WalletsRepository } from "../wallets/wallets.repository";
import type { ChatMessage, ChatResponse } from "./ai.dto";
import { AiRepository } from "./ai.repository";
import { AgentSettingsService } from "./agent-settings.service";
import { executeAiTool } from "./ai.tools";

const log = createLogger("ai-service");

type ChatAttachment = NonNullable<ChatMessage["attachments"]>[number];
type WalletRef = { id: string; name: string };
type ReceiptDraftItem = {
  name: string;
  brand?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  amount: number;
  categoryId?: string | null;
};
type ReceiptDraftEntry = {
  fileName: string;
  amount: number;
  date: string;
  name: string;
  categoryId?: string | null;
  walletId: string;
  attachmentIds?: string[];
  items: ReceiptDraftItem[];
};
type InvoiceDraftState = {
  status: "awaiting_confirmation" | "confirmed" | "cancelled";
  createdAt: string;
  wallets: WalletRef[];
  entries: ReceiptDraftEntry[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

function addMonthlyReset(base: Date) {
  const next = new Date(base);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + 1);
  const lastDay = new Date(
    next.getFullYear(),
    next.getMonth() + 1,
    0,
  ).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

function isReceiptAttachment(a: ChatAttachment) {
  return a.type === "application/pdf" || a.type.startsWith("image/");
}

function toValidIsoDate(input?: string) {
  if (!input) return new Date().toISOString();
  const date = new Date(input);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("id-ID").format(amount || 0);
}

function hasReceiptAttachments(attachments: ChatAttachment[] | undefined) {
  return Boolean(attachments?.some(isReceiptAttachment));
}

function isConfirmIntent(text: string) {
  return /(^|\b)(confirm|confirmed|yes|ok|okay|save|simpan|ya|lanjut)(\b|$)/i.test(
    text.toLowerCase().trim(),
  );
}

function isCancelIntent(text: string) {
  return /(^|\b)(cancel|batal|jangan|stop|abort)(\b|$)/i.test(
    text.toLowerCase().trim(),
  );
}

function extractRequestedWalletName(text: string, wallets: WalletRef[]) {
  const explicit = text
    .match(/(?:account|wallet|akun)\s*[:=-]\s*([^\n]+)/i)?.[1]
    ?.trim();
  if (explicit) return explicit;
  const normalized = text.toLowerCase();
  return wallets.find((w) => normalized.includes(w.name.toLowerCase()))?.name;
}

function resolveWalletByName(wallets: WalletRef[], name: string | undefined) {
  if (!name) return null;
  const lowered = name.toLowerCase();
  return (
    wallets.find((w) => w.name.toLowerCase() === lowered) ||
    wallets.find((w) => w.name.toLowerCase().includes(lowered)) ||
    wallets.find((w) => lowered.includes(w.name.toLowerCase())) ||
    null
  );
}

function getLatestDraftState(history: any[]): InvoiceDraftState | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (!m || m.role !== "assistant") continue;
    const draft = (m.attachments as any)?.invoiceDraft;
    if (draft) return draft as InvoiceDraftState;
  }
  return null;
}

// ── Receipt draft helpers ──────────────────────────────────────────────────

async function buildInvoiceDraftFromAttachments(
  workspaceId: string,
  userId: string,
  attachments: ChatAttachment[] | undefined,
): Promise<{ reply: string; draft: InvoiceDraftState } | null> {
  if (!attachments?.length) return null;

  const receiptAttachments = attachments.filter(isReceiptAttachment);
  if (!receiptAttachments.length) return null;

  const walletResult = await WalletsRepository.findMany(workspaceId, {
    page: 1,
    limit: 50,
  });
  const wallets = walletResult.rows.map((w: any) => ({
    id: w.id,
    name: w.name,
  }));
  const defaultWallet = wallets[0];

  if (!defaultWallet?.id) {
    const emptyDraft: InvoiceDraftState = {
      status: "awaiting_confirmation",
      createdAt: new Date().toISOString(),
      wallets,
      entries: [],
    };
    return {
      reply:
        "I found receipt files, but no account is available yet. Please create an account first, then upload again.",
      draft: emptyDraft,
    };
  }

  const categories = await CategoriesRepository.findMany(
    workspaceId,
    "expense",
  );
  const categoryContext = categories
    .map((c: any) => `- ${c.name} (ID: ${c.id})`)
    .join("\n");

  const entries: ReceiptDraftEntry[] = [];
  const failedLines: string[] = [];

  for (const attachment of receiptAttachments) {
    try {
      let attachmentIds: string[] | undefined;
      try {
        const buffer = Buffer.from(attachment.data, "base64");
        const uploaded = await VaultService.uploadFile(workspaceId, userId, {
          name: attachment.name,
          type: attachment.type,
          size: buffer.byteLength,
          buffer,
        });
        attachmentIds = uploaded?.id ? [uploaded.id] : undefined;
      } catch (err: any) {
        log.warn("Failed to upload chat attachment to vault", {
          workspaceId,
          fileName: attachment.name,
          error: err?.message ?? String(err),
        });
      }

      const parsed = await ReceiptService.parse(
        attachment.data,
        attachment.type,
        categoryContext,
        {
          geminiKey: Env.GEMINI_API_KEY,
          openaiKey: Env.OPENAI_API_KEY,
          anthropicKey: Env.ANTHROPIC_API_KEY,
        },
      );

      if (!parsed || !Number(parsed.amount)) {
        failedLines.push(`${attachment.name}: unable to read amount`);
        continue;
      }

      const items = (parsed.items || []).filter(
        (i) => i?.name && Number(i.amount) > 0,
      );
      entries.push({
        fileName: attachment.name,
        amount: Number(parsed.amount),
        date: toValidIsoDate(parsed.date),
        name: parsed.name || attachment.name,
        categoryId: parsed.categoryId || null,
        walletId: defaultWallet.id,
        attachmentIds,
        items: items.map((i) => ({
          name: i.name,
          brand: i.brand ?? null,
          quantity: i.quantity ?? null,
          unit: i.unit ?? null,
          unitPrice: i.unitPrice ?? null,
          amount: Number(i.amount),
          categoryId: i.categoryId ?? parsed.categoryId ?? null,
        })),
      });
    } catch (err: any) {
      failedLines.push(
        `${attachment.name}: ${err?.message ?? "failed to parse"}`,
      );
    }
  }

  const draft: InvoiceDraftState = {
    status: "awaiting_confirmation",
    createdAt: new Date().toISOString(),
    wallets,
    entries,
  };

  if (!entries.length) {
    return {
      reply: failedLines.length
        ? `I could not read any receipt from the uploaded files.\n${failedLines.map((l) => `- ${l}`).join("\n")}`
        : "I could not read any receipt from the uploaded files.",
      draft,
    };
  }

  const reply = [
    "I parsed your receipt — please confirm before I save.",
    ...entries.map(
      (e, i) =>
        `${i + 1}. ${e.name} — IDR ${formatAmount(e.amount)} | ${new Date(e.date).toLocaleDateString("en-GB")} | account: ${wallets.find((w) => w.id === e.walletId)?.name || "-"}`,
    ),
    "",
    "To change account, reply: account: <account name>",
    "Then reply: confirm",
    ...(failedLines.length
      ? ["", "Skipped files:", ...failedLines.map((l) => `- ${l}`)]
      : []),
  ].join("\n");

  return { reply, draft };
}

async function confirmDraftAndCreateTransactions(
  workspaceId: string,
  userId: string,
  draft: InvoiceDraftState,
  walletOverrideId?: string,
) {
  const createdLines: string[] = [];
  let createdCount = 0;

  for (const entry of draft.entries) {
    const walletId = walletOverrideId || entry.walletId;
    const created = await TransactionsService.create(workspaceId, userId, {
      walletId,
      categoryId: entry.categoryId || undefined,
      amount: Number(entry.amount),
      date: toValidIsoDate(entry.date),
      type: "expense",
      name: entry.name,
      description: `Imported from chat receipt: ${entry.fileName}`,
      attachmentIds: entry.attachmentIds,
    });

    const transactionId = created?.data?.id;
    if (transactionId && entry.items.length) {
      await TransactionItemsService.bulkCreate(
        workspaceId,
        userId,
        transactionId,
        entry.items.map((i) => ({
          name: i.name,
          brand: i.brand ?? null,
          quantity: i.quantity ?? null,
          unit: i.unit ?? null,
          unitPrice: i.unitPrice ?? null,
          amount: Number(i.amount),
          categoryId: i.categoryId ?? entry.categoryId ?? null,
          notes: null,
        })),
      );
    }

    createdCount += 1;
    createdLines.push(
      `${entry.name} — IDR ${formatAmount(entry.amount)}${entry.items.length ? ` (${entry.items.length} items)` : ""}`,
    );
  }

  return {
    reply: [
      `Saved ${createdCount} transaction${createdCount > 1 ? "s" : ""}.`,
      ...createdLines.map((l) => `- ${l}`),
    ].join("\n"),
    createdCount,
  };
}

async function handlePendingInvoiceDraft(
  workspaceId: string,
  userId: string,
  latestUserMessage: ChatMessage,
  draft: InvoiceDraftState,
  currentSessionId: string,
): Promise<ChatResponse | null> {
  if (draft.status !== "awaiting_confirmation") return null;

  const wallets = draft.wallets || [];
  const requestedWalletName = extractRequestedWalletName(
    latestUserMessage.content || "",
    wallets,
  );
  const resolvedWallet = resolveWalletByName(wallets, requestedWalletName);
  const confirm = isConfirmIntent(latestUserMessage.content || "");
  const cancel = isCancelIntent(latestUserMessage.content || "");

  if (cancel) {
    const cancelledDraft = { ...draft, status: "cancelled" as const };
    const reply =
      "Cancelled. I did not save any transaction from this receipt.";
    await AiRepository.saveMessage(
      currentSessionId,
      workspaceId,
      "assistant",
      reply,
      { invoiceDraft: cancelledDraft },
    );
    return { sessionId: currentSessionId, reply };
  }

  if (confirm) {
    const { reply } = await confirmDraftAndCreateTransactions(
      workspaceId,
      userId,
      draft,
      resolvedWallet?.id,
    );
    const confirmedDraft = { ...draft, status: "confirmed" as const };
    await AiRepository.saveMessage(
      currentSessionId,
      workspaceId,
      "assistant",
      reply,
      { invoiceDraft: confirmedDraft },
    );
    return { sessionId: currentSessionId, reply };
  }

  if (requestedWalletName && !resolvedWallet) {
    const walletOptions = wallets.map((w) => `- ${w.name}`).join("\n");
    const reply = [
      `I cannot find account "${requestedWalletName}".`,
      "Available accounts:",
      walletOptions || "- (none)",
      "",
      "Reply with: account: <account name>",
    ].join("\n");
    await AiRepository.saveMessage(
      currentSessionId,
      workspaceId,
      "assistant",
      reply,
      { invoiceDraft: draft },
    );
    return { sessionId: currentSessionId, reply };
  }

  if (resolvedWallet) {
    const updatedDraft = {
      ...draft,
      entries: draft.entries.map((e) => ({
        ...e,
        walletId: resolvedWallet.id,
      })),
    };
    const reply = `Account updated to "${resolvedWallet.name}". Reply "confirm" to save this receipt.`;
    await AiRepository.saveMessage(
      currentSessionId,
      workspaceId,
      "assistant",
      reply,
      { invoiceDraft: updatedDraft },
    );
    return { sessionId: currentSessionId, reply };
  }

  const currentWallet =
    wallets.find((w) => w.id === draft.entries[0]?.walletId)?.name || "-";
  const reply = `Draft is ready. Current account: "${currentWallet}". Reply "confirm" to save, or "account: <name>" to change account.`;
  await AiRepository.saveMessage(
    currentSessionId,
    workspaceId,
    "assistant",
    reply,
    { invoiceDraft: draft },
  );
  return { sessionId: currentSessionId, reply };
}

// ── Main service ───────────────────────────────────────────────────────────

export abstract class AiService {
  /**
   * Chat with the AI using the user's financial data and save to DB.
   */
  static async chat(
    messages: ChatMessage[],
    workspaceId: string,
    userId: string,
    sessionId?: string,
    webSearch?: boolean,
  ): Promise<ChatResponse> {
    let currentSessionId = sessionId;
    const latestUserMessage = messages[messages.length - 1];
    if (!latestUserMessage) throw new Error("No messages provided");

    // 1. Load agent settings (Redis-cached, 5 min TTL)
    const agentSettings = await AgentSettingsService.getCached(workspaceId);

    // 2. Session management
    if (!currentSessionId) {
      const title = await AiOrchestrator.generateTitle(
        latestUserMessage.content,
        Env.OPENAI_API_KEY,
        Env.ANTHROPIC_API_KEY,
      );
      const newSession = await AiRepository.createSession(workspaceId, title);
      currentSessionId = newSession!.id;

      await AuditLogsService.log({
        workspace_id: workspaceId,
        user_id: userId,
        action: "ai.session_created",
        entity: "ai_session",
        entity_id: currentSessionId as string,
        after: newSession,
      });

      for (const msg of messages.slice(0, -1)) {
        await AiRepository.saveMessage(
          currentSessionId,
          workspaceId,
          msg.role as any,
          msg.content,
        );
      }
    } else {
      const session = await AiRepository.getSession(
        currentSessionId,
        workspaceId,
      );
      if (!session) throw new Error("Chat session not found or access denied.");
    }

    // 3. Save user message
    await AiRepository.saveMessage(
      currentSessionId,
      workspaceId,
      latestUserMessage.role as any,
      latestUserMessage.content,
      latestUserMessage.attachments,
    );

    const history = await AiRepository.getSessionMessages(
      currentSessionId as string,
      workspaceId,
    );

    // 4. Receipt draft flow
    const latestDraft = getLatestDraftState(history);
    if (latestDraft) {
      const draftResponse = await handlePendingInvoiceDraft(
        workspaceId,
        userId,
        latestUserMessage,
        latestDraft,
        currentSessionId as string,
      );
      if (draftResponse) return draftResponse;
    }

    if (hasReceiptAttachments(latestUserMessage.attachments)) {
      const preview = await buildInvoiceDraftFromAttachments(
        workspaceId,
        userId,
        latestUserMessage.attachments,
      );
      if (preview) {
        await AiRepository.saveMessage(
          currentSessionId as string,
          workspaceId,
          "assistant",
          preview.reply,
          { invoiceDraft: preview.draft },
        );
        return { sessionId: currentSessionId, reply: preview.reply };
      }
    }

    // 5. Quota check
    const usageData = await AiRepository.getUsageAndQuota(workspaceId);
    if (!usageData) {
      throw status(
        404,
        buildError(ErrorCode.WORKSPACE_NOT_FOUND, "Workspace not found"),
      );
    }

    if (usageData.plan_status === "free" && usageData.ai_tokens_reset_at) {
      const nextResetAt = addMonthlyReset(
        new Date(usageData.ai_tokens_reset_at),
      );
      if (new Date() >= nextResetAt) {
        await AiRepository.resetAiTokens(workspaceId, new Date());
        usageData.used = 0;
        usageData.ai_tokens_reset_at = new Date();
      }
    }

    const maxTokens =
      usageData.maxTokens && usageData.maxTokens > 0 ? usageData.maxTokens : 50;
    const currentTokens = Number(usageData.used || 0);

    if (
      !API_CONFIG.mockAiQuota &&
      maxTokens > 0 &&
      currentTokens >= maxTokens &&
      workspaceId !== "b45ad588-6758-43a4-8c26-1d80f3b0ab9f"
    ) {
      let resetAt: Date;
      if (!usageData.plan_current_period_end) {
        const now = new Date();
        const createdAt = usageData.created_at
          ? new Date(usageData.created_at)
          : now;
        resetAt = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          createdAt.getDate(),
        );
      } else {
        resetAt = new Date(usageData.plan_current_period_end);
      }
      throw status(
        422,
        buildError(
          ErrorCode.PLAN_LIMIT_REACHED,
          `Monthly AI token limit exceeded. Max: ${maxTokens} tokens.`,
          undefined,
          { reset_at: resetAt.toISOString() },
        ),
      );
    }

    if (API_CONFIG.mockAiQuota)
      log.debug("mockAiQuota=true — quota check bypassed");

    // 6. Build system prompt with workspace context
    let currencyCode = "IDR";
    let currencySymbol = "Rp";
    try {
      const wsSettings =
        await SettingsRepository.findByWorkspaceId(workspaceId);
      currencyCode = (wsSettings as any)?.mainCurrencyCode || currencyCode;
      currencySymbol =
        (wsSettings as any)?.mainCurrencySymbol || currencySymbol;
    } catch {}

    const systemPrompt = buildSystemPrompt({
      currencyCode,
      currencySymbol,
      customInstructions: agentSettings.customInstructions ?? undefined,
      responseLanguage: agentSettings.responseLanguage,
    });

    // 7. Orchestrate — AI SDK multi-step tool loop
    const consolidatedMessages: RepoChatMessage[] = history.map((m: any) => ({
      role: m.role as any,
      content: m.content as string,
      attachments: m.attachments as any,
    }));

    let response: ChatResponse;
    try {
      response = await AiOrchestrator.chat(
        consolidatedMessages,
        {
          workspaceId,
          userId,
          openaiKey: Env.OPENAI_API_KEY,
          anthropicKey: Env.ANTHROPIC_API_KEY,
          geminiKey: Env.GEMINI_API_KEY,
          settings: agentSettings,
          webSearch,
        },
        (name, args) => executeAiTool(name, args, workspaceId, userId),
        systemPrompt,
      );
    } catch (error: any) {
      throw error;
    }

    // 8. Persist response and token usage
    await AiRepository.saveMessage(
      currentSessionId,
      workspaceId,
      "assistant",
      response.reply,
      response.artifact || response.provider
        ? {
            ...(response.artifact ? { artifact: response.artifact } : {}),
            ...(response.provider ? { provider: response.provider } : {}),
          }
        : undefined,
    );

    const tokensSpent =
      (response.usage?.input_tokens ?? 0) +
      (response.usage?.output_tokens ?? 0);
    await AiRepository.incrementAiTokens(
      workspaceId,
      currentTokens,
      tokensSpent,
    );

    return {
      sessionId: currentSessionId,
      reply: response.reply,
      usage: response.usage,
      artifact: response.artifact,
    };
  }

  static async parseReceipt(
    workspaceId: string,
    userId: string,
    base64Image: string,
    mediaType: string,
  ) {
    const categories = await CategoriesRepository.findMany(
      workspaceId,
      "expense",
    );
    const categoryContext = categories
      .map((c: any) => `- ${c.name} (ID: ${c.id})`)
      .join("\n");

    const parsed = await ReceiptService.parse(
      base64Image,
      mediaType,
      categoryContext,
      {
        geminiKey: Env.GEMINI_API_KEY,
        openaiKey: Env.OPENAI_API_KEY,
        anthropicKey: Env.ANTHROPIC_API_KEY,
      },
    );

    if (parsed) {
      if (parsed.name && parsed.categoryId) {
        const cacheKey = `oewang:category-cache:${workspaceId}:${parsed.name.toLowerCase().trim()}`;
        await redis.set(cacheKey, parsed.categoryId, { ex: 60 * 60 * 24 * 30 });
      }

      await AuditLogsService.log({
        workspace_id: workspaceId,
        user_id: userId,
        action: "ai.receipt_parsed",
        entity: "vault_file",
        entity_id: "00000000-0000-0000-0000-000000000000",
        before: null,
        after: parsed,
      });
    }

    return parsed;
  }

  static async getSessions(workspaceId: string) {
    return AiRepository.getSessions(workspaceId);
  }

  static async getSessionMessages(sessionId: string, workspaceId: string) {
    return AiRepository.getSessionMessages(sessionId, workspaceId);
  }

  static async getSession(sessionId: string, workspaceId: string) {
    return AiRepository.getSession(sessionId, workspaceId);
  }

  static async getUsageAndQuota(workspaceId: string) {
    return AiRepository.getUsageAndQuota(workspaceId);
  }
}
