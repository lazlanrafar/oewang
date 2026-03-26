import { Env } from "@workspace/constants";
import { buildSuccess } from "@workspace/utils";
import { AiService } from "../ai/ai.service";
import { TransactionsService } from "../transactions/transactions.service";
import { VaultService as vaultService } from "../vault/vault.service";
import { WalletsRepository as walletsRepository } from "../wallets/wallets.repository";
import { IntegrationsRepository } from "./integrations.repository";

export abstract class IntegrationsService {
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
      settings: { phoneNumber: cleaned, connectedByUserId: userId },
      isActive: true,
    });

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
      settings: { telegramChatId, connectedByUserId: userId },
      isActive: true,
    });

    return buildSuccess(integration, "Telegram connected successfully");
  }

  static async getAll(workspace_id: string) {
    const integrations = await IntegrationsRepository.findAll(workspace_id);
    return buildSuccess(integrations, "Integrations retrieved successfully");
  }

  static getVerifyToken() {
    return Env.WHATSAPP_VERIFY_TOKEN;
  }

  static async handleMetaWhatsAppWebhook(payload: Record<string, any>) {
    // Meta payload: entry[] > changes[] > value > messages[]
    const entry = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message) return "OK";

    const fromUserNumber = message.from; // Phone number
    const wamid = message.id;
    const text = message.text?.body?.trim();
    const type = message.type;

    if (!fromUserNumber) return "OK";

    // Check for linking command
    if (type === "text" && text) {
      const match = text.match(/^Connect Oewang\s+([a-f0-9-]{36})$/i);
      if (match) {
        const targetWorkspaceId = match[1];

        const targetUserId =
          await IntegrationsRepository.findFirstMemberId(targetWorkspaceId);

        if (!targetUserId) {
          await IntegrationsService.sendWhatsAppMessage(
            fromUserNumber,
            "❌ Could not find a valid user to link with this workspace. Please use the link from the Oewang app.",
          );
          return "OK";
        }

        await IntegrationsService.connectWhatsApp(
          targetWorkspaceId,
          targetUserId,
          fromUserNumber,
        );

        await IntegrationsService.sendWhatsAppMessage(
          fromUserNumber,
          "✅ Your WhatsApp is now connected to Oewang! You can now send me your expenses or upload receipts anytime.",
        );
        return "OK";
      }
    }

    const integration =
      await IntegrationsRepository.findByWhatsAppNumber(fromUserNumber);

    if (!integration) return "Unauthorized / unknown number";

    const { workspaceId, settings } = integration;
    let userId = (settings as any)?.connectedByUserId;

    // Resolve invalid zero UUID or missing userId to a valid workspace member
    if (!userId || userId === "00000000-0000-0000-0000-000000000000") {
      const fallbackId =
        await IntegrationsRepository.findFirstMemberId(workspaceId);
      if (!fallbackId) return "Need a valid user to create transaction";
      userId = fallbackId;
    }

    try {
      if (type === "image" || type === "document") {
        const media = message.image || message.document;
        const mediaId = media?.id;
        const mimeType = media?.mime_type;

        if (mediaId && mimeType) {
          // 1. Get media URL from Meta
          const mediaResponse = await fetch(
            `https://graph.facebook.com/v21.0/${mediaId}`,
            {
              headers: {
                Authorization: `Bearer ${Env.WHATSAPP_ACCESS_TOKEN}`,
              },
            },
          );

          if (!mediaResponse.ok)
            throw new Error("Failed to get media URL from Meta");
          const mediaData = await mediaResponse.json();
          const downloadUrl = mediaData.url;

          // 2. Download media
          const response = await fetch(downloadUrl, {
            headers: {
              Authorization: `Bearer ${Env.WHATSAPP_ACCESS_TOKEN}`,
            },
          });

          if (!response.ok)
            throw new Error("Failed to download media from Meta");

          const arrayBuffer = await response.arrayBuffer();
          const base64Image = Buffer.from(arrayBuffer).toString("base64");

          // 3. Upload to Vault
          const vaultFile = await vaultService.uploadFile(workspaceId, userId, {
            name: `receipt-${Date.now()}.${mimeType === "application/pdf" ? "pdf" : "jpg"}`,
            type: mimeType,
            size: Buffer.byteLength(base64Image, "base64"),
            buffer: Buffer.from(base64Image, "base64"),
          });

          // 4. Parse with AI
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

              const amountStr = Number(parsedReceipt.amount).toLocaleString();
              const replyBody = `✅ Added expense: ${parsedReceipt.name || "Receipt"} for ${amountStr}. Includes attached receipt file!`;
              await IntegrationsService.sendWhatsAppMessage(
                fromUserNumber,
                replyBody,
              );
            }
          } else {
            await IntegrationsService.sendWhatsAppMessage(
              fromUserNumber,
              "❌ Sorry, I couldn't extract receipt data from that file.",
            );
          }
        }
      } else if (type === "text" && text) {
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

            await IntegrationsService.sendWhatsAppMessage(
              fromUserNumber,
              chatResponse.reply,
            );
          }
        } catch (chatErr) {
          console.error("[WhatsApp AI Chat Error]", chatErr);
          await IntegrationsService.sendWhatsAppMessage(
            fromUserNumber,
            "❌ Sorry, I encountered an error processing your request.",
          );
        }
      }
    } catch (error) {
      console.error("[WhatsApp Webhook] Error processing message:", error);
    }

    return "OK";
  }

  static async handleTelegramWebhook(payload: Record<string, any>) {
    const message = payload.message;
    if (!message) return "OK";

    const chatId = message.chat?.id?.toString();
    const text = message.text?.trim();
    const photo = message.photo; // Array of PhotoSize, last is biggest

    if (!chatId) return "OK";

    // 1. Check for linking command
    if (text) {
      const startMatch =
        text.match(/^\/start\s+([a-f0-9-]{36})(?:___([a-f0-9-]{36}))?$/i) ||
        text.match(/^Connect Oewang\s+([a-f0-9-]{36})(?:___([a-f0-9-]{36}))?$/i);

      if (startMatch) {
        const targetWorkspaceId = startMatch[1];
        let targetUserId = startMatch[2];

        // If userId is missing, try to find the first member of the workspace
        if (!targetUserId) {
          targetUserId =
            await IntegrationsRepository.findFirstMemberId(targetWorkspaceId);
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

    const { workspaceId, settings } = integration;
    let userId = (settings as any)?.connectedByUserId;

    // Resolve invalid zero UUID or missing userId to a valid workspace member
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

              await TransactionsService.create(workspaceId, userId, {
                walletId: defaultWallet.id,
                amount: parsedReceipt.amount,
                date: parsedReceipt.date || new Date().toISOString(),
                type: "expense",
                name: parsedReceipt.name || "Expense",
                description: "Parsed automatically from Telegram Receipt",
                categoryId: parsedReceipt.categoryId,
                attachmentIds: vaultFile ? [vaultFile.id] : undefined,
              });

              const amountStr = Number(parsedReceipt.amount).toLocaleString();
              const replyBody = `✅ Added expense: ${parsedReceipt.name || "Receipt"} for ${amountStr}. Includes attached receipt file!`;
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

            await IntegrationsService.sendTelegramMessage(
              chatId,
              chatResponse.reply,
            );
          }
        } catch (chatErr) {
          console.error("[Telegram AI Chat Error]", chatErr);
          await IntegrationsService.sendTelegramMessage(
            chatId,
            "❌ Sorry, I encountered an error processing your request.",
          );
        }
      }
    } catch (error) {
      console.error("[Telegram Webhook] Error processing message:", error);
    }

    return "OK";
  }

  static async sendTelegramMessage(chatId: string, text: string) {
    const token = Env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.warn("[Telegram] Bot token missing, cannot send message.");
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
      console.error(
        "[Telegram] Failed to send message:",
        await response.text(),
      );
    }
  }

  static async sendWhatsAppMessage(to: string, body: string) {
    const accessToken = Env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = Env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      console.warn("[WhatsApp] Meta credentials missing, cannot send reply.");
      return;
    }

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body },
        }),
      },
    );

    if (!response.ok) {
      console.error("[WhatsApp] Failed to send reply:", await response.text());
    }
  }
}
