import { IntegrationsRepository } from "./integrations.repository";
import { AiService } from "../ai/ai.service";
import { TransactionsService } from "../transactions/transactions.service";
import { walletsRepository } from "../wallets/wallets.repository";
import { vaultService } from "../vault/vault.service";
import { buildSuccess } from "@workspace/utils";
import { Env } from "@workspace/constants";

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

  static async handleWhatsAppWebhook(payload: Record<string, any>) {
    const from = payload.From || ""; // 'whatsapp:+123456789'
    const cleanPhone = from.replace("whatsapp:", "");

    if (!cleanPhone) return "Acknowledge Twilio"; // Acknowledge Twilio

    const integration =
      await IntegrationsRepository.findByWhatsAppNumber(cleanPhone);

    if (!integration) return "Unauthorized / unknown number"; // Unauthorized / unknown number

    const { workspaceId, settings } = integration;
    const userId = (settings as any)?.connectedByUserId;

    if (!userId) return "Need a valid user to create transaction"; // Need a valid user to create transaction

    const numMedia = parseInt(payload.NumMedia || "0", 10);
    const toTwilioNumber = payload.To || "";
    const fromUserNumber = payload.From || "";

    try {
      if (numMedia > 0) {
        const mediaUrl = payload.MediaUrl0;
        const contentType = payload.MediaContentType0;

        if (
          contentType?.startsWith("image/") ||
          contentType === "application/pdf"
        ) {
          // Fetch the file from Twilio
          const twilioAuth = Buffer.from(
            `${Env.TWILIO_ACCOUNT_SID}:${Env.TWILIO_AUTH_TOKEN}`,
          ).toString("base64");

          const response = await fetch(mediaUrl, {
            headers: {
              Authorization: `Basic ${twilioAuth}`,
            },
          });

          if (!response.ok)
            throw new Error("Failed to fetch media from Twilio");

          const arrayBuffer = await response.arrayBuffer();
          const base64Image = Buffer.from(arrayBuffer).toString("base64");

          // 1. Upload receipt to Vault
          const vaultFile = await vaultService.uploadFile(workspaceId, {
            name: `receipt-${Date.now()}.${contentType === "application/pdf" ? "pdf" : "jpg"}`,
            type: contentType,
            size: Buffer.byteLength(base64Image, "base64"),
            buffer: Buffer.from(base64Image, "base64"),
          });

          // 2. Parse with AI
          const parsedReceipt = await AiService.parseReceipt(
            workspaceId,
            base64Image,
            contentType,
          );

          if (parsedReceipt && parsedReceipt.amount) {
            // Find a default wallet for the workspace to attach the transaction to
            const wallets = await walletsRepository.findMany(workspaceId);
            if (wallets.length > 0) {
              const defaultWallet = wallets[0];
              if (!defaultWallet) return "OK";

              // Save the transaction
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

              if (toTwilioNumber && fromUserNumber) {
                const amountStr = Number(parsedReceipt.amount).toLocaleString();
                const replyBody = `✅ Added expense: ${parsedReceipt.name || "Receipt"} for ${amountStr}. Includes attached receipt file!`;
                await IntegrationsService.sendWhatsAppMessage(
                  fromUserNumber,
                  toTwilioNumber,
                  replyBody,
                );
              }
            }
          } else {
            if (toTwilioNumber && fromUserNumber) {
              await IntegrationsService.sendWhatsAppMessage(
                fromUserNumber,
                toTwilioNumber,
                "❌ Sorry, I couldn't extract receipt data from that file.",
              );
            }
          }
        }
      } else if (payload.Body) {
        const text = payload.Body.trim();
        if (text) {
          try {
            const chatResponse = await AiService.chat(
              [{ role: "user", content: text }],
              workspaceId,
              userId,
            );

            if (
              chatResponse &&
              chatResponse.reply &&
              toTwilioNumber &&
              fromUserNumber
            ) {
              await IntegrationsService.sendWhatsAppMessage(
                fromUserNumber,
                toTwilioNumber,
                chatResponse.reply,
              );
            }
          } catch (chatErr) {
            console.error("[WhatsApp AI Chat Error]", chatErr);
            if (toTwilioNumber && fromUserNumber) {
              await IntegrationsService.sendWhatsAppMessage(
                fromUserNumber,
                toTwilioNumber,
                "❌ Sorry, I encountered an error processing your request.",
              );
            }
          }
        }
      }
    } catch (error) {
      console.error("[WhatsApp Webhook] Error processing message:", error);
    }

    return "OK";
  }

  private static async sendWhatsAppMessage(
    to: string,
    from: string,
    body: string,
  ) {
    const accountSid = Env.TWILIO_ACCOUNT_SID;
    const authToken = Env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      console.warn("[WhatsApp] Twilio credentials missing, cannot send reply.");
      return;
    }

    const twilioAuth = Buffer.from(`${accountSid}:${authToken}`).toString(
      "base64",
    );
    const params = new URLSearchParams();
    params.append("To", to);
    params.append("From", from);
    params.append("Body", body);

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${twilioAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    if (!response.ok) {
      console.error("[WhatsApp] Failed to send reply:", await response.text());
    }
  }
}
