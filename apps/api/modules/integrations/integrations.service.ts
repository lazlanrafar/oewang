import { Env } from "@workspace/constants";
import { logger } from "@workspace/logger";
import { buildSuccess } from "@workspace/utils";
import { cacheDel, cacheGet, cacheSet } from "../../lib/cache";
import { AiService } from "../ai/ai.service";
import { executeAiTool } from "../ai/ai.tools";
import { NotificationsService } from "../notifications/notifications.service";
import { TransactionItemsService } from "../transactions/items/transaction-items.service";
import { TransactionsService } from "../transactions/transactions.service";
import { VaultService as vaultService } from "../vault/vault.service";
import { WalletsRepository as walletsRepository } from "../wallets/wallets.repository";
import { WorkspacesService } from "../workspaces/workspaces.service";
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

    const createResult = await executeAiTool(
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

  static async connectWhatsApp(
    workspaceId: string,
    userId: string,
    phoneNumber: string,
  ) {
    // Basic phone number sanitization
    const cleaned = phoneNumber.replace(/[^0-9+]/g, "");

    const integration = await IntegrationsRepository.upsert({
      workspaceId,
      provider: "whatsapp",
      settings: { phoneNumber: cleaned },
      isActive: true,
      connectedBy: userId,
    });

    NotificationsService.create({
      workspace_id: workspaceId,
      user_id: userId,
      type: "integration.connected",
      title: "WhatsApp Connected",
      message: `WhatsApp has been connected to your workspace. You can now receive alerts on ${cleaned}.`,
      link: "/apps",
    }).catch((err) =>
      logger.error("Failed to create WhatsApp connected notification", { err }),
    );

    await cacheDel(integrationsKey(workspaceId));

    return buildSuccess(integration, "WhatsApp connected successfully");
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
        provider === "whatsapp"
          ? "WhatsApp"
          : provider.charAt(0).toUpperCase() + provider.slice(1);
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
        const targetWorkspaceId = IntegrationsService.isUuid(workspaceIdentifier)
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

    try {
      if (photo && photo.length > 0) {
        // Handle receipt image
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

          // C. Upload to Vault
          const vaultFile = await vaultService.uploadFile(workspaceId, userId, {
            name: `receipt-${Date.now()}.jpg`,
            type: mimeType,
            size: Buffer.byteLength(base64Image, "base64"),
            buffer: Buffer.from(base64Image, "base64"),
          });

          // D. Parse with AI
          const parsedReceipt = await AiService.parseReceipt(
            workspaceId,
            userId,
            base64Image,
            mimeType,
          );

          if (parsedReceipt && parsedReceipt.amount) {
            const walletsResult = await walletsRepository.findMany(workspaceId);
            const wallets = walletsResult.rows;
            if (wallets.length > 0) {
              const defaultWallet = wallets[0];
              if (!defaultWallet) return "OK";

              const transactionRes = await TransactionsService.create(
                workspaceId,
                userId,
                {
                  walletId: defaultWallet.id,
                  amount: parsedReceipt.amount,
                  date: parsedReceipt.date || new Date().toISOString(),
                  type: "expense",
                  name: parsedReceipt.name || "Expense",
                  description: "Parsed automatically from Telegram Receipt",
                  categoryId: parsedReceipt.categoryId,
                  attachmentIds: vaultFile ? [vaultFile.id] : undefined,
                },
              );

              // Save items if extracted
              if (parsedReceipt.items && parsedReceipt.items.length > 0) {
                const transactionId = (transactionRes as any).data.id;
                await TransactionItemsService.bulkCreate(
                  workspaceId,
                  userId,
                  transactionId,
                  parsedReceipt.items as any,
                );
              }

              const amountStr = Number(parsedReceipt.amount).toLocaleString();
              const itemsCount = parsedReceipt.items?.length || 0;
              const replyBody = `✅ Added expense: ${parsedReceipt.name || "Receipt"} for ${amountStr}.${itemsCount > 0 ? ` Included ${itemsCount} line items!` : ""} Includes attached receipt file!`;
              await IntegrationsService.sendTelegramMessage(chatId, replyBody);
            }
          } else {
            await IntegrationsService.sendTelegramMessage(
              chatId,
              "❌ Sorry, I couldn't extract receipt data from that image.",
            );
          }
        }
      } else if (text) {
        // Handle AI Chat
        try {
          const chatSessionId = (settings as any)?.chatSessionId;
          const chatResponse = await AiService.chat(
            [{ role: "user", content: text }],
            workspaceId,
            userId,
            chatSessionId,
          );

          if (chatResponse && chatResponse.reply) {
            // Save current session ID if it's new
            if (
              chatResponse.sessionId &&
              chatResponse.sessionId !== chatSessionId
            ) {
              await IntegrationsRepository.updateSettings(
                integration.id,
                workspaceId,
                {
                  ...((settings as any) || {}),
                  chatSessionId: chatResponse.sessionId,
                },
              );
            }

            const replyText = await IntegrationsService.normalizeAiReplyForChat(
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
    } catch (error) {
      logger.error("Telegram webhook message processing failed", { error });
    }

    return "OK";
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

  static async handleEvolutionWhatsAppWebhook(payload: Record<string, any>) {
    const event = payload.event as string | undefined;

    // Only process incoming messages (ignore sent/delivery events)
    if (event && event !== "messages.upsert") return "OK";

    const data = payload.data as Record<string, any> | undefined;
    if (!data) return "OK";

    // Skip messages sent by the bot itself
    if (data.key?.fromMe === true) return "OK";

    // Use instance name from webhook payload so the reply goes back to the right instance
    const instanceName: string =
      (payload.instance as string) || Env.EVOLUTION_API_INSTANCE || "";

    const remoteJid: string = data.key?.remoteJid || "";
    // Extract plain phone number from JID (e.g. "62812345@s.whatsapp.net" → "62812345")
    const fromNumber = remoteJid.split("@")[0] || "";
    if (!fromNumber) return "OK";

    const messageType: string = data.messageType || "";
    const text: string =
      data.message?.conversation?.trim() ||
      data.message?.extendedTextMessage?.text?.trim() ||
      "";
    const imageMessage = data.message?.imageMessage;
    const documentMessage = data.message?.documentMessage;

    // Linking command
    if (text) {
      const connectPayload =
        IntegrationsService.parseTelegramConnectPayload(text);

      const targetWorkspaceId = connectPayload
        ? IntegrationsService.isUuid(connectPayload.workspaceIdentifier)
          ? connectPayload.workspaceIdentifier
          : await IntegrationsRepository.findWorkspaceIdBySlugOrId(
              connectPayload.workspaceIdentifier,
            )
        : null;

      if (targetWorkspaceId) {
        const targetUserId =
          await IntegrationsRepository.findFirstMemberId(targetWorkspaceId);

        if (!targetUserId) {
          await IntegrationsService.sendEvolutionWhatsAppMessage(
            fromNumber,
            "❌ Could not find a valid user to link with this workspace. Please use the link from the Oewang app.",
            instanceName,
          );
          return "OK";
        }

        await IntegrationsService.connectWhatsApp(
          targetWorkspaceId,
          targetUserId,
          fromNumber,
        );
        await IntegrationsService.sendEvolutionWhatsAppMessage(
          fromNumber,
          "✅ Your WhatsApp is now connected to Oewang! You can now send me your expenses or upload receipts anytime.",
          instanceName,
        );
        return "OK";
      }
    }

    const integration = await IntegrationsRepository.findByWhatsAppNumber(
      fromNumber,
      "whatsapp",
    );
    if (!integration) return "OK";

    const { workspaceId, settings, connectedBy } = integration;
    let userId = connectedBy || (settings as any)?.connectedByUserId;

    if (!userId || userId === "00000000-0000-0000-0000-000000000000") {
      userId = await IntegrationsRepository.findFirstMemberId(workspaceId);
      if (!userId) return "Need a valid user";
    }

    try {
      const mediaMsg = imageMessage || documentMessage;

      if (
        mediaMsg ||
        messageType === "imageMessage" ||
        messageType === "documentMessage"
      ) {
        // Download media via Evolution API
        const mediaUrl =
          mediaMsg?.url ||
          data.message?.imageMessage?.url ||
          data.message?.documentMessage?.url;
        const mimeType =
          mediaMsg?.mimetype ||
          data.message?.imageMessage?.mimetype ||
          "image/jpeg";

        if (!mediaUrl) {
          await IntegrationsService.sendEvolutionWhatsAppMessage(
            fromNumber,
            "❌ Could not retrieve the media file. Please try again.",
            instanceName,
          );
          return "OK";
        }

        const response = await fetch(mediaUrl, {
          headers: { apikey: Env.EVOLUTION_API_TOKEN || "" },
        });
        if (!response.ok)
          throw new Error("Failed to download media from Evolution API");

        const arrayBuffer = await response.arrayBuffer();
        const base64Image = Buffer.from(arrayBuffer).toString("base64");

        const vaultFile = await vaultService.uploadFile(workspaceId, userId, {
          name: `receipt-${Date.now()}.${mimeType === "application/pdf" ? "pdf" : "jpg"}`,
          type: mimeType,
          size: Buffer.byteLength(base64Image, "base64"),
          buffer: Buffer.from(base64Image, "base64"),
        });

        const parsedReceipt = await AiService.parseReceipt(
          workspaceId,
          userId,
          base64Image,
          mimeType,
        );

        if (parsedReceipt && parsedReceipt.amount) {
          const walletsResult = await walletsRepository.findMany(workspaceId);
          if (walletsResult.rows.length > 0) {
            const defaultWallet = walletsResult.rows[0];
            await TransactionsService.create(workspaceId, userId, {
              walletId: defaultWallet.id,
              amount: parsedReceipt.amount,
              date: parsedReceipt.date || new Date().toISOString(),
              type: "expense",
              name: parsedReceipt.name || "Expense",
              description: "Parsed automatically from WhatsApp Receipt",
              categoryId: parsedReceipt.categoryId,
              attachmentIds: vaultFile ? [vaultFile.id] : undefined,
            });

            await IntegrationsService.sendEvolutionWhatsAppMessage(
              fromNumber,
              `✅ Added expense: ${parsedReceipt.name || "Receipt"} for ${Number(parsedReceipt.amount).toLocaleString()}.`,
              instanceName,
            );
          }
        } else {
          await IntegrationsService.sendEvolutionWhatsAppMessage(
            fromNumber,
            "❌ Sorry, I couldn't extract receipt data from that image.",
            instanceName,
          );
        }
      } else if (text) {
        // AI Chat
        const chatSessionId = (settings as any)?.chatSessionId;
        const chatResponse = await AiService.chat(
          [{ role: "user", content: text }],
          workspaceId,
          userId,
          chatSessionId,
        );

        if (chatResponse?.reply) {
          if (
            chatResponse.sessionId &&
            chatResponse.sessionId !== chatSessionId
          ) {
            await IntegrationsRepository.updateSettings(
              integration.id,
              workspaceId,
              {
                ...((settings as any) || {}),
                chatSessionId: chatResponse.sessionId,
              },
            );
          }
          const replyText = await IntegrationsService.normalizeAiReplyForChat(
            chatResponse.reply,
            workspaceId,
            userId,
          );
          await IntegrationsService.sendEvolutionWhatsAppMessage(
            fromNumber,
            replyText,
            instanceName,
          );
        }
      }
    } catch (err) {
      logger.error("Evolution WhatsApp webhook failed", { err });
    }

    return "OK";
  }

  static async sendEvolutionWhatsAppMessage(
    to: string,
    text: string,
    instanceName?: string,
  ) {
    const baseUrl = Env.EVOLUTION_API_URL;
    const token = Env.EVOLUTION_API_TOKEN;
    const instance = instanceName || Env.EVOLUTION_API_INSTANCE;

    if (!baseUrl || !token || !instance) {
      logger.warn("Evolution API not configured, cannot send WhatsApp message");
      return;
    }

    // Normalize number: strip non-digits except leading +, then strip the +
    const number = to.replace(/[^0-9]/g, "");

    const response = await fetch(
      `${baseUrl}/message/sendText/${instance}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: token,
        },
        body: JSON.stringify({ number, text }),
      },
    );

    if (!response.ok) {
      logger.error("Failed to send Evolution WhatsApp message", {
        status: response.status,
        body: await response.text(),
      });
    }
  }
}
