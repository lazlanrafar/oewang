import { Env } from "@workspace/constants";
import { logger } from "@workspace/logger";
import { buildSuccess } from "@workspace/utils";
import { cacheDel, cacheGet, cacheSet } from "../../lib/cache";
import { AiRepository } from "../ai/ai.repository";
import {
  AiService,
  buildInvoiceDraftFromAttachments,
  type ChatAttachment,
  getLatestDraftState,
  handlePendingInvoiceDraft,
} from "../ai/ai.service";
import { AiSidecarClient } from "../ai/ai-sidecar-client";
import { NotificationsService } from "../notifications/notifications.service";
import { chatViaSidecar } from "./ai-sidecar";
import { IntegrationsRepository } from "./integrations.repository";

const INTEGRATIONS_TTL = 60 * 60 * 24; // 24h — integration configs rarely change
const integrationsKey = (workspaceId: string) =>
  `oewang:integrations:${workspaceId}`;

export abstract class IntegrationsService {
  private static extractLeadingJson(text: string): {
    payload: Record<string, any>;
    remaining: string;
  } | null {
    const source = text.trimStart();
    if (!source.startsWith("{")) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;
    let endIndex = -1;

    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (!ch) continue;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === "\\") {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
    }

    if (endIndex < 0) return null;

    const jsonChunk = source.slice(0, endIndex + 1);
    try {
      const payload = JSON.parse(jsonChunk);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return null;
      }
      return {
        payload: payload as Record<string, any>,
        remaining: source.slice(endIndex + 1).trim(),
      };
    } catch {
      return null;
    }
  }

  private static isTransactionDraftPayload(
    payload: Record<string, any>,
  ): boolean {
    const type = payload.type;
    const amount = Number(payload.amount);
    const walletId = payload.walletId;
    const name = payload.name;

    if (!["income", "expense", "transfer"].includes(type)) return false;
    if (!Number.isFinite(amount) || amount <= 0) return false;
    if (typeof walletId !== "string" || walletId.trim().length === 0)
      return false;
    if (typeof name !== "string" || name.trim().length === 0) return false;
    // If the payload already looks like a tool result wrapper, skip fallback execution.
    if ("success" in payload || "data" in payload || "error" in payload)
      return false;
    return true;
  }

  private static async normalizeAiReplyForChat(
    rawReply: string,
    workspaceId: string,
    userId: string,
  ): Promise<string> {
    const extracted = IntegrationsService.extractLeadingJson(rawReply);
    if (!extracted) return rawReply.trim();

    const { payload, remaining } = extracted;
    if (!IntegrationsService.isTransactionDraftPayload(payload)) {
      return (remaining || rawReply).trim();
    }

    const { result: createResult } = await AiSidecarClient.executeTool(
      "create_transaction",
      payload,
      workspaceId,
      userId,
    );

    if (createResult?.success && !createResult?.dryRun) {
      const amount = Number(payload.amount || 0);
      const amountStr = amount.toLocaleString("id-ID");
      const wallet = String(payload.walletId || "").trim();
      const name = String(payload.name || "Transaksi").trim();
      return `✅ Sudah dicatat: ${name} Rp${amountStr} dari ${wallet}.`;
    }

    if (createResult?.success && createResult?.dryRun) {
      const fallbackText =
        remaining || "⚠️ Mode dry-run aktif, transaksi belum disimpan.";
      return `${fallbackText}\n\n⚠️ Mode dry-run aktif, transaksi belum masuk database.`.trim();
    }

    const errorMessage = createResult?.error
      ? `\n\n⚠️ Gagal menyimpan transaksi: ${createResult.error}`
      : "";
    const fallbackText = remaining || "⚠️ Gagal menyimpan transaksi.";
    return `${fallbackText}${errorMessage}`.trim();
  }

  private static isUuid(value: string): boolean {
    return /^[a-f0-9-]{36}$/i.test(value);
  }

  private static parseTelegramConnectPayload(text: string): {
    workspaceIdentifier: string;
    userIdCandidate?: string;
  } | null {
    const startCommandMatch = text.match(/^\/start(?:\s+(.+))?$/i);
    const legacyConnectMatch = text.match(/^Connect Oewang\s+(.+)$/i);
    const rawPayload = (
      startCommandMatch?.[1] ||
      legacyConnectMatch?.[1] ||
      ""
    ).trim();

    if (!rawPayload) return null;

    const firstToken = rawPayload.split(/\s+/)[0] || "";
    if (!firstToken) return null;

    const decodedToken = (() => {
      try {
        return decodeURIComponent(firstToken);
      } catch {
        return firstToken;
      }
    })();

    const [workspaceRaw, userIdRaw] = decodedToken.split("___", 2);
    const workspaceIdentifier = workspaceRaw?.trim();

    if (!workspaceIdentifier) return null;

    return {
      workspaceIdentifier,
      userIdCandidate: userIdRaw?.trim() || undefined,
    };
  }

  static async connectTelegram(
    workspaceId: string,
    userId: string,
    telegramChatId: string,
  ) {
    const integration = await IntegrationsRepository.upsert({
      workspaceId,
      provider: "telegram",
      settings: { telegramChatId },
      isActive: true,
      connectedBy: userId,
    });

    NotificationsService.create({
      workspace_id: workspaceId,
      user_id: userId,
      type: "integration.connected",
      title: "Telegram Connected",
      message:
        "Telegram has been connected to your workspace. You can now chat with your AI assistant via Telegram.",
      link: "/apps",
    }).catch((err) =>
      logger.error("Failed to create Telegram connected notification", {
        err,
        workspaceId,
        userId,
      }),
    );

    await cacheDel(integrationsKey(workspaceId));

    return buildSuccess(integration, "Telegram connected successfully");
  }

  static async getAll(workspace_id: string) {
    const key = integrationsKey(workspace_id);
    const cached = await cacheGet<object[]>(key);
    if (cached)
      return buildSuccess(cached, "Integrations retrieved successfully");

    const integrations = await IntegrationsRepository.findAll(workspace_id);
    await cacheSet(key, integrations, INTEGRATIONS_TTL);
    return buildSuccess(integrations, "Integrations retrieved successfully");
  }

  static async disconnectIntegration(
    workspaceId: string,
    provider: string,
    userId?: string,
  ) {
    const disconnected = await IntegrationsRepository.disconnectByProvider(
      workspaceId,
      provider,
    );

    if (!disconnected) {
      return buildSuccess(null, `${provider} is already disconnected`);
    }

    if (userId) {
      const providerLabel =
        provider.charAt(0).toUpperCase() + provider.slice(1);
      NotificationsService.create({
        workspace_id: workspaceId,
        user_id: userId,
        type: "integration.disconnected",
        title: `${providerLabel} Disconnected`,
        message: `${providerLabel} has been disconnected from your workspace.`,
        link: "/apps",
      }).catch(() => {});
    }

    await cacheDel(integrationsKey(workspaceId));

    return buildSuccess(disconnected, `${provider} disconnected successfully`);
  }

  static async handleTelegramWebhook(payload: Record<string, any>) {
    logger.debug("Telegram webhook received", { payload });
    const message = payload.message;
    if (!message) return "OK";

    const chatId = message.chat?.id?.toString();
    const text = message.text?.trim();
    const photo = message.photo; // Array of PhotoSize, last is biggest

    if (!chatId) return "OK";

    // 1. Check for linking command
    if (text) {
      const connectPayload =
        IntegrationsService.parseTelegramConnectPayload(text);

      if (connectPayload) {
        const { workspaceIdentifier, userIdCandidate } = connectPayload;
        const targetWorkspaceId = IntegrationsService.isUuid(
          workspaceIdentifier,
        )
          ? workspaceIdentifier
          : await IntegrationsRepository.findWorkspaceIdBySlugOrId(
              workspaceIdentifier,
            );
        let targetUserId = IntegrationsService.isUuid(userIdCandidate || "")
          ? userIdCandidate
          : undefined;

        if (!targetWorkspaceId) {
          await IntegrationsService.sendTelegramMessage(
            chatId,
            "❌ I couldn't find that workspace. Please reconnect from your Oewang dashboard.",
          );
          return "OK";
        }

        // If userId is missing, try to find the first member of the workspace
        if (!targetUserId) {
          targetUserId =
            (await IntegrationsRepository.findFirstMemberId(
              targetWorkspaceId,
            )) || undefined;
        }

        // If still no userId, we can't link safely
        if (!targetUserId) {
          await IntegrationsService.sendTelegramMessage(
            chatId,
            "❌ Could not find a valid user to link with this workspace. Please use the link from the Oewang app.",
          );
          return "OK";
        }

        await IntegrationsService.connectTelegram(
          targetWorkspaceId,
          targetUserId,
          chatId,
        );

        await IntegrationsService.sendTelegramMessage(
          chatId,
          "✅ Your Telegram is now connected to Oewang! You can now send me your expenses or upload receipts anytime.",
        );
        return "OK";
      }
    }

    // 2. Find integration
    const integration =
      await IntegrationsRepository.findByTelegramChatId(chatId);

    if (!integration) {
      await IntegrationsService.sendTelegramMessage(
        chatId,
        "👋 Welcome to Oewang! To connect your account, please use the 'Connect Telegram' button in your Oewang dashboard or type `Connect Oewang <your-workspace-id>`.",
      );
      return "OK";
    }

    const { workspaceId, settings, connectedBy } = integration;
    let userId = connectedBy || (settings as any)?.connectedByUserId;

    if (!userId || userId === "00000000-0000-0000-0000-000000000000") {
      const fallbackId =
        await IntegrationsRepository.findFirstMemberId(workspaceId);
      if (!fallbackId) return "Need a valid user to create transaction";
      userId = fallbackId;
    }

    const chatSessionId = (settings as any)?.chatSessionId;

    const persistSessionId = async (sessionId: string) => {
      await IntegrationsRepository.updateSettings(integration.id, workspaceId, {
        ...((settings as any) || {}),
        chatSessionId: sessionId,
      });
    };

    const stopTyping = IntegrationsService.startTelegramTyping(chatId);
    try {
      if (photo && photo.length > 0) {
        // Handle receipt image — same draft/confirm flow as web chat.
        const fileId = photo[photo.length - 1].file_id;

        // A. Get file path from Telegram
        const fileResponse = await fetch(
          `https://api.telegram.org/bot${Env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`,
        );
        const fileData = await fileResponse.json();

        if (fileData.ok && fileData.result.file_path) {
          const filePath = fileData.result.file_path;
          const downloadUrl = `https://api.telegram.org/file/bot${Env.TELEGRAM_BOT_TOKEN}/${filePath}`;

          // B. Download media
          const response = await fetch(downloadUrl);
          if (!response.ok)
            throw new Error("Failed to download media from Telegram");

          const arrayBuffer = await response.arrayBuffer();
          const base64Image = Buffer.from(arrayBuffer).toString("base64");
          const mimeType = "image/jpeg"; // Telegram photos are usually jpeg

          // Vault upload + parsing happen inside buildInvoiceDraftFromAttachments
          const attachments: ChatAttachment[] = [
            {
              name: `receipt-${Date.now()}.jpg`,
              type: mimeType,
              data: base64Image,
            },
          ];

          const preview = await buildInvoiceDraftFromAttachments(
            workspaceId,
            userId,
            attachments,
          );

          if (preview) {
            let sessionId = chatSessionId;
            if (!sessionId) {
              const newSession = await AiRepository.createSession(
                workspaceId,
                "Telegram Receipt",
              );
              sessionId = newSession?.id;
              if (sessionId) await persistSessionId(sessionId);
            }

            if (sessionId) {
              await AiRepository.saveMessage(
                sessionId,
                workspaceId,
                "user",
                "[receipt photo]",
                attachments,
              );
              await AiRepository.saveMessage(
                sessionId,
                workspaceId,
                "assistant",
                preview.reply,
                { invoiceDraft: preview.draft },
              );
            }

            await IntegrationsService.sendTelegramMessage(
              chatId,
              preview.reply,
            );
          } else {
            await IntegrationsService.sendTelegramMessage(
              chatId,
              "❌ Sorry, I couldn't extract receipt data from that image.",
            );
          }
        }
      } else if (text) {
        // If a receipt draft is awaiting confirmation for this chat, let it
        // own this turn (confirm/cancel/"account: X") before falling back to
        // normal chat — same precedence as web's chatBegin.
        let handledByDraft = false;
        if (chatSessionId) {
          const history = await AiRepository.getSessionMessages(
            chatSessionId,
            workspaceId,
          );
          const pendingDraft = getLatestDraftState(history);
          if (pendingDraft?.status === "awaiting_confirmation") {
            const draftResponse = await handlePendingInvoiceDraft(
              workspaceId,
              userId,
              { role: "user", content: text },
              pendingDraft,
              chatSessionId,
            );
            if (draftResponse) {
              await IntegrationsService.sendTelegramMessage(
                chatId,
                draftResponse.reply,
              );
              handledByDraft = true;
            }
          }
        }

        if (!handledByDraft) {
          // Handle AI Chat
          try {
            const chatResponse =
              (await chatViaSidecar(
                text,
                workspaceId,
                userId,
                chatSessionId,
              )) ??
              (await AiService.chat(
                [{ role: "user", content: text }],
                workspaceId,
                userId,
                chatSessionId,
              ));

            if (chatResponse && chatResponse.reply) {
              // Save current session ID if it's new
              if (
                chatResponse.sessionId &&
                chatResponse.sessionId !== chatSessionId
              ) {
                await persistSessionId(chatResponse.sessionId);
              }

              const replyText =
                await IntegrationsService.normalizeAiReplyForChat(
                  chatResponse.reply,
                  workspaceId,
                  userId,
                );
              await IntegrationsService.sendTelegramMessage(chatId, replyText);
            }
          } catch (chatErr) {
            logger.error("Telegram AI chat failed", { err: chatErr });
            await IntegrationsService.sendTelegramMessage(
              chatId,
              "❌ Sorry, I encountered an error processing your request.",
            );
          }
        }
      }
    } catch (error) {
      logger.error("Telegram webhook message processing failed", { error });
    } finally {
      stopTyping();
    }

    return "OK";
  }

  // ponytail: Telegram's own "typing…" indicator expires after ~5s, so it
  // must be re-sent while a slow (OCR/LLM) reply is being built.
  private static startTelegramTyping(chatId: string): () => void {
    const tick = () =>
      IntegrationsService.sendTelegramChatAction(chatId, "typing").catch(
        () => {},
      );
    tick();
    const interval = setInterval(tick, 4000);
    return () => clearInterval(interval);
  }

  static async sendTelegramChatAction(chatId: string, action: string) {
    const token = Env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action }),
    }).catch((err) => logger.debug("Telegram sendChatAction failed", { err }));
  }

  static async sendTelegramMessage(chatId: string, text: string) {
    const token = Env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      logger.warn("Telegram bot token missing, cannot send message");
      return;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
        }),
      },
    );

    if (!response.ok) {
      logger.error("Failed to send Telegram message", {
        body: await response.text(),
      });
    }
  }
}
