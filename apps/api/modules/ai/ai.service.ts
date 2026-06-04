import {
  AiOrchestrator,
  ReceiptService,
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
import { TransactionItemsService } from "../transactions/items/transaction-items.service";
import { TransactionsService } from "../transactions/transactions.service";
import { VaultService } from "../vault/vault.service";
import { WalletsRepository } from "../wallets/wallets.repository";
import type { ChatMessage, ChatResponse } from "./ai.dto";
import { AiRepository } from "./ai.repository";
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

function isReceiptAttachment(attachment: ChatAttachment) {
  return (
    attachment.type === "application/pdf" ||
    attachment.type.startsWith("image/")
  );
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
  const normalized = text.toLowerCase().trim();
  return /(^|\b)(confirm|confirmed|yes|ok|okay|save|simpan|ya|lanjut)(\b|$)/i.test(
    normalized,
  );
}

function isCancelIntent(text: string) {
  const normalized = text.toLowerCase().trim();
  return /(^|\b)(cancel|batal|jangan|stop|abort)(\b|$)/i.test(normalized);
}

function extractRequestedWalletName(text: string, wallets: WalletRef[]) {
  const explicit = text
    .match(/(?:account|wallet|akun)\s*[:=-]\s*([^\n]+)/i)?.[1]
    ?.trim();
  if (explicit) return explicit;

  const normalized = text.toLowerCase();
  const byMention = wallets.find((wallet) =>
    normalized.includes(wallet.name.toLowerCase()),
  );
  return byMention?.name;
}

function resolveWalletByName(wallets: WalletRef[], name: string | undefined) {
  if (!name) return null;
  const lowered = name.toLowerCase();
  return (
    wallets.find((wallet) => wallet.name.toLowerCase() === lowered) ||
    wallets.find((wallet) => wallet.name.toLowerCase().includes(lowered)) ||
    wallets.find((wallet) => lowered.includes(wallet.name.toLowerCase())) ||
    null
  );
}

function getLatestDraftState(history: any[]): InvoiceDraftState | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (!message || message.role !== "assistant") continue;
    const invoiceDraft = (message.attachments as any)?.invoiceDraft;
    if (!invoiceDraft) continue;
    return invoiceDraft as InvoiceDraftState;
  }
  return null;
}

export abstract class AiService {
  private static async buildInvoiceDraftFromAttachments(
    workspaceId: string,
    userId: string,
    attachments: ChatAttachment[] | undefined,
  ): Promise<{ reply: string; draft: InvoiceDraftState } | null> {
    if (!attachments || attachments.length === 0) return null;

    const receiptAttachments = attachments.filter(isReceiptAttachment);
    if (receiptAttachments.length === 0) return null;

    const walletResult = await WalletsRepository.findMany(workspaceId, {
      page: 1,
      limit: 50,
    });
    const wallets = walletResult.rows.map((wallet: any) => ({
      id: wallet.id,
      name: wallet.name,
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
          "I found invoice files, but no account is available yet. Please create one account first, then upload again.",
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
        } catch (error: any) {
          log.warn("Failed to upload chat attachment to vault", {
            workspaceId,
            fileName: attachment.name,
            error: error?.message ?? String(error),
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
          (item) => item?.name && Number(item.amount) > 0,
        );
        entries.push({
          fileName: attachment.name,
          amount: Number(parsed.amount),
          date: toValidIsoDate(parsed.date),
          name: parsed.name || attachment.name,
          categoryId: parsed.categoryId || null,
          walletId: defaultWallet.id,
          attachmentIds,
          items: items.map((item) => ({
            name: item.name,
            brand: item.brand ?? null,
            quantity: item.quantity ?? null,
            unit: item.unit ?? null,
            unitPrice: item.unitPrice ?? null,
            amount: Number(item.amount),
            categoryId: item.categoryId ?? parsed.categoryId ?? null,
          })),
        });
      } catch (error: any) {
        failedLines.push(
          `${attachment.name}: ${error?.message ?? "failed to parse"}`,
        );
      }
    }

    const draft: InvoiceDraftState = {
      status: "awaiting_confirmation",
      createdAt: new Date().toISOString(),
      wallets,
      entries,
    };

    if (entries.length === 0) {
      return {
        reply:
          failedLines.length > 0
            ? `I could not read any invoice from the uploaded files.\n${failedLines.map((line) => `- ${line}`).join("\n")}`
            : "I could not read any invoice from the uploaded files.",
        draft,
      };
    }

    const reply = [
      "I parsed your receipt, please confirm before I save.",
      ...entries.map(
        (entry, index) =>
          `${index + 1}. ${entry.name} — IDR ${formatAmount(entry.amount)} | ${new Date(entry.date).toLocaleDateString("en-GB")} | account: ${wallets.find((w) => w.id === entry.walletId)?.name || "-"}`,
      ),
      "",
      "To change account, reply: account: <account name>",
      "Then reply: confirm",
      ...(failedLines.length > 0
        ? ["", "Skipped files:", ...failedLines.map((line) => `- ${line}`)]
        : []),
    ].join("\n");

    return { reply, draft };
  }

  private static async confirmDraftAndCreateTransactions(
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
      if (transactionId && entry.items.length > 0) {
        await TransactionItemsService.bulkCreate(
          workspaceId,
          userId,
          transactionId,
          entry.items.map((item) => ({
            name: item.name,
            brand: item.brand ?? null,
            quantity: item.quantity ?? null,
            unit: item.unit ?? null,
            unitPrice: item.unitPrice ?? null,
            amount: Number(item.amount),
            categoryId: item.categoryId ?? entry.categoryId ?? null,
            notes: null,
          })),
        );
      }

      createdCount += 1;
      createdLines.push(
        `${entry.name} — IDR ${formatAmount(entry.amount)}${entry.items.length > 0 ? ` (${entry.items.length} items)` : ""}`,
      );
    }

    return {
      reply: [
        `Saved ${createdCount} transaction${createdCount > 1 ? "s" : ""}.`,
        ...createdLines.map((line) => `- ${line}`),
      ].join("\n"),
      createdCount,
    };
  }

  private static async handlePendingInvoiceDraft(
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
      const cancelledDraft: InvoiceDraftState = {
        ...draft,
        status: "cancelled",
      };
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
      const { reply } = await AiService.confirmDraftAndCreateTransactions(
        workspaceId,
        userId,
        draft,
        resolvedWallet?.id,
      );
      const confirmedDraft: InvoiceDraftState = {
        ...draft,
        status: "confirmed",
      };
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
      const walletOptions = wallets
        .map((wallet) => `- ${wallet.name}`)
        .join("\n");
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
      const updatedDraft: InvoiceDraftState = {
        ...draft,
        entries: draft.entries.map((entry) => ({
          ...entry,
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
      wallets.find((wallet) => wallet.id === draft.entries[0]?.walletId)
        ?.name || "-";
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

  private static async autoImportReceiptAttachments(
    workspaceId: string,
    userId: string,
    attachments: ChatAttachment[] | undefined,
    currentSessionId: string,
  ): Promise<ChatResponse | null> {
    const preview = await AiService.buildInvoiceDraftFromAttachments(
      workspaceId,
      userId,
      attachments,
    );
    if (!preview) return null;

    await AiRepository.saveMessage(
      currentSessionId,
      workspaceId,
      "assistant",
      preview.reply,
      { invoiceDraft: preview.draft },
    );

    return {
      sessionId: currentSessionId,
      reply: preview.reply,
    };
  }

  /**
   * Chat with AI using the user's financial context and save to DB.
   * Delegates to AiOrchestrator for intent detection and context building.
   */
  static async chat(
    messages: ChatMessage[],
    workspaceId: string,
    userId: string,
    sessionId?: string,
  ): Promise<ChatResponse> {
    let currentSessionId = sessionId;
    const latestUserMessage = messages[messages.length - 1];

    if (!latestUserMessage) throw new Error("No messages provided");

    // 1. Session Management
    if (!currentSessionId) {
      const title = await AiOrchestrator.generateTitle(
        latestUserMessage.content,
        {
          geminiKey: Env.GEMINI_API_KEY,
          openaiKey: Env.OPENAI_API_KEY,
          anthropicKey: Env.ANTHROPIC_API_KEY,
        },
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

      // Save previous messages if any
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

    // Save latest user message
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

    // 2. Draft flow for receipt attachments: parse first, save only on explicit confirm.
    const latestDraft = getLatestDraftState(history);
    if (latestDraft) {
      const draftResponse = await AiService.handlePendingInvoiceDraft(
        workspaceId,
        userId,
        latestUserMessage,
        latestDraft,
        currentSessionId as string,
      );
      if (draftResponse) {
        return draftResponse;
      }
    }

    if (hasReceiptAttachments(latestUserMessage.attachments)) {
      const previewResponse = await AiService.autoImportReceiptAttachments(
        workspaceId,
        userId,
        latestUserMessage.attachments,
        currentSessionId as string,
      );
      if (previewResponse) {
        return previewResponse;
      }
    }

    // 3. Load chat history into orchestrator
    const consolidatedMessages: RepoChatMessage[] = history.map((m: any) => ({
      role: m.role as any,
      content: m.content as string,
      attachments: m.attachments as any,
    }));

    // 4. Quota Check
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
      // Calculate reset date
      let resetAt: Date;

      if (!usageData.plan_current_period_end) {
        // Default to same day next month
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
          `Monthly AI Token limit exceeded. Max: ${maxTokens} tokens.`,
          undefined,
          { reset_at: resetAt.toISOString() },
        ),
      );
    }

    if (API_CONFIG.mockAiQuota) {
      log.debug("mockAiQuota=true — quota check bypassed");
    }

    // 5. Orchestrate
    let response: ChatResponse;
    try {
      response = await AiOrchestrator.chat(
        consolidatedMessages,
        {
          workspaceId,
          userId,
          geminiKey: Env.GEMINI_API_KEY,
          openaiKey: Env.OPENAI_API_KEY,
          anthropicKey: Env.ANTHROPIC_API_KEY,
        },
        {
          executeTransactionAction: (name, args) =>
            executeAiTool(name, args, workspaceId, userId),
          executeDebtAction: (name, args) =>
            executeAiTool(name, args, workspaceId, userId),
          executeAnalysisAction: (name, args) =>
            executeAiTool(name, args, workspaceId, userId),
          executeItemsAction: (name, args) =>
            executeAiTool(name, args, workspaceId, userId),
        },
      );
    } catch (error: any) {
      throw error;
    }

    // 6. Save Response & Token Usage
    await AiRepository.saveMessage(
      currentSessionId,
      workspaceId,
      "assistant" as const,
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

  /**
   * Parse receipt data from image or PDF.
   */
  static async parseReceipt(
    workspaceId: string,
    userId: string,
    base64Image: string,
    mediaType: string,
  ) {
    // We need category context for the parser
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
        entity: "vault_file", // Receipt parsing is conceptually linked to storage/vault
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
