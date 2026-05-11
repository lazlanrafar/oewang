/**
 * WhatsApp Web Service
 *
 * Manages whatsapp-web.js client sessions per workspace.
 * Each workspace gets its own WhatsApp Web client (Puppeteer / WhatsApp Web protocol).
 *
 * Session lifecycle:
 *  IDLE       → no client
 *  STARTING   → client initialised, waiting for QR
 *  QR_READY   → QR code emitted, waiting for phone scan
 *  CONNECTED  → authenticated, ready to send/receive
 *  ERROR      → fatal error, requires reconnect
 */

import { createLogger } from "@workspace/logger";
import { Client, LocalAuth, type Message } from "whatsapp-web.js";
import { IntegrationsRepository } from "../integrations.repository";
import { AiService } from "../../ai/ai.service";
import { TransactionsService } from "../../transactions/transactions.service";
import { VaultService as vaultService } from "../../vault/vault.service";
import { WalletsRepository as walletsRepository } from "../../wallets/wallets.repository";
import { TransactionItemsService } from "../../transactions/items/transaction-items.service";
import { SystemSettingsRepository } from "../../system-settings/system-settings.repository";

const log = createLogger("whatsapp-web");

export type WhatsAppWebSessionStatus =
  | "idle"
  | "starting"
  | "qr_ready"
  | "connected"
  | "disconnected"
  | "error";

export interface WhatsAppWebSessionInfo {
  status: WhatsAppWebSessionStatus;
  qrCode?: string; // base64 data URI
  phoneNumber?: string;
  error?: string;
  connectedAt?: Date;
}

let globalClient: Client | null = null;
let globalSessionInfo: WhatsAppWebSessionInfo = { status: "idle" };

export abstract class WhatsAppWebService {
  // ────────────────────────────────────────────────────────────────────────────
  // Public API (Global Bot)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Start the global WhatsApp Web session.
   * Typically called from the system admin panel.
   */
  static async startGlobalSession(): Promise<WhatsAppWebSessionInfo> {
    if (
      globalClient &&
      globalSessionInfo.status !== "error" &&
      globalSessionInfo.status !== "disconnected"
    ) {
      log.info(`[WA-Web] Global session already exists`, {
        status: globalSessionInfo.status,
      });
      return globalSessionInfo;
    }

    globalSessionInfo = {
      status: "starting",
    };

    const { Env } = await import("@workspace/constants");
    const dataPath = Env.WHATSAPP_WEB_SESSION_DATA_PATH || "./.wwebjs_auth";

    // ── Pre-initialization Cleanup ──────────────────────────────────────────
    // Puppeteer may leave lock files if the process crashed, preventing restart.
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const sessionDir = path.join(dataPath, `session-global-bot`);

      if (fs.existsSync(sessionDir)) {
        const filesToClean = [
          "SingletonLock",
          "SingletonCookie",
          "SingletonSocket",
          "DevToolsActivePort",
        ];
        for (const file of filesToClean) {
          const filePath = path.join(sessionDir, file);
          if (fs.existsSync(filePath)) {
            log.info(`[WA-Web] Removing stale Puppeteer file: ${filePath}`);
            try {
              fs.unlinkSync(filePath);
            } catch (unlinkErr) {
              log.warn(`[WA-Web] Failed to unlink ${file}`, { unlinkErr });
            }
          }
        }
      }
    } catch (err) {
      log.warn(`[WA-Web] Failed to check/remove lock files (non-fatal)`, {
        err,
      });
    }

    log.info(`[WA-Web] Initializing client with dataPath: ${dataPath}`);

    // LocalAuth persists session data to disk
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: `global-bot`,
        dataPath,
      }),
      webVersionCache: {
        type: "remote",
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
      },
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-extensions",
        ],
      },
    });

    globalClient = client;

    // ── QR code emitted ────────────────────────────────────────────────────
    client.on("qr", async (qr) => {
      log.info(`[WA-Web] Global QR code generated`);
      try {
        const QRCode = await import("qrcode");
        const qrDataUri = await QRCode.toDataURL(qr, {
          width: 300,
          margin: 2,
          color: { dark: "#000000", light: "#FFFFFF" },
        });
        globalSessionInfo.qrCode = qrDataUri;
        globalSessionInfo.status = "qr_ready";
      } catch (err) {
        log.error(`[WA-Web] Failed to generate QR data URI`, { err });
        globalSessionInfo.qrCode = qr; // fallback: raw string
        globalSessionInfo.status = "qr_ready";
      }
    });

    // ── Authenticated ──────────────────────────────────────────────────────
    client.on("authenticated", () => {
      log.info(`[WA-Web] Global bot authenticated`);
    });

    // ── Ready (fully connected) ────────────────────────────────────────────
    client.on("ready", async () => {
      log.info(`[WA-Web] Global client ready`);
      globalSessionInfo.status = "connected";
      globalSessionInfo.qrCode = undefined;
      globalSessionInfo.connectedAt = new Date();

      try {
        const me = await client.getContactById(client.info.wid._serialized);
        globalSessionInfo.phoneNumber = me.number || client.info.wid.user;
      } catch {
        globalSessionInfo.phoneNumber = client.info.wid?.user;
      }

      if (globalSessionInfo.phoneNumber) {
        try {
          await SystemSettingsRepository.setSetting(
            "WHATSAPP_WEB_NUMBER",
            globalSessionInfo.phoneNumber,
          );
        } catch (err) {
          log.error(
            `[WA-Web] Failed to save WHATSAPP_WEB_NUMBER to system settings`,
            { err },
          );
        }
      }
    });

    // ── Incoming messages ──────────────────────────────────────────────────
    client.on("message_create", async (msg: Message) => {
      if (msg.fromMe) return;
      await WhatsAppWebService.handleIncomingMessage(msg);
    });

    // ── Disconnected ───────────────────────────────────────────────────────
    client.on("disconnected", async (reason) => {
      log.warn(`[WA-Web] Global disconnected`, { reason });
      globalSessionInfo.status = "disconnected";
      globalClient = null;
    });

    // ── Auth failure ───────────────────────────────────────────────────────
    client.on("auth_failure", (message) => {
      log.error(`[WA-Web] Global auth failure`, { message });
      globalSessionInfo.status = "error";
      globalSessionInfo.error = `Authentication failed: ${message}`;
      globalClient = null;
    });

    log.info(`[WA-Web] Calling client.initialize()...`);
    client
      .initialize()
      .then(() => {
        log.info(`[WA-Web] client.initialize() promise resolved`);
      })
      .catch((err) => {
        log.error(`[WA-Web] Failed to initialize global client`, { err });
        globalSessionInfo.status = "error";
        globalSessionInfo.error =
          err instanceof Error ? err.message : String(err);
        globalClient = null;
      });

    return globalSessionInfo;
  }

  /**
   * Get the current global session status.
   */
  static getSessionStatus(): WhatsAppWebSessionInfo {
    return globalSessionInfo;
  }

  /**
   * Destroy the global session.
   */
  static async destroySession(): Promise<void> {
    if (!globalClient) return;

    log.info(`[WA-Web] Destroying global session`);
    try {
      await globalClient.logout();
    } catch {}
    try {
      await globalClient.destroy();
    } catch {}

    globalClient = null;
    globalSessionInfo = { status: "disconnected" };
  }

  /**
   * Send a text message from the global bot.
   */
  static async sendMessage(to: string, body: string): Promise<boolean> {
    if (!globalClient || globalSessionInfo.status !== "connected") {
      log.warn(`[WA-Web] Cannot send message — no active global session`);
      return false;
    }

    try {
      const chatId = to.includes("@") ? to : `${to}@c.us`;
      await globalClient.sendMessage(chatId, body);
      return true;
    } catch (err) {
      log.error(`[WA-Web] Failed to send message`, { err });
      return false;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Internal: message handling (mirrors the Twilio/Telegram logic)
  // ────────────────────────────────────────────────────────────────────────────

  private static async handleIncomingMessage(msg: Message) {
    const text = msg.body?.trim();
    const hasMedia = msg.hasMedia;
    const from = msg.from; // e.g. "62812345@c.us"
    const senderNumber = from
      .replace("@c.us", "")
      .replace("@s.whatsapp.net", "");

    try {
      // 1. Check for "Connect Oewang <workspaceId>"
      if (text && text.toLowerCase().startsWith("connect oewang ")) {
        const workspaceId = text.substring("connect oewang ".length).trim();
        if (!workspaceId) return;

        // Verify workspace & get a user ID to associate
        const userId =
          await IntegrationsRepository.findFirstMemberId(workspaceId);
        if (!userId) {
          await globalClient?.sendMessage(
            from,
            "❌ Invalid workspace ID or workspace has no members.",
          );
          return;
        }

        await IntegrationsRepository.upsert({
          workspaceId,
          provider: "whatsapp-web",
          isActive: true,
          settings: {
            phoneNumber: senderNumber,
            connectedByUserId: userId,
            connectedAt: new Date().toISOString(),
          },
        });

        await globalClient?.sendMessage(
          from,
          `✅ Successfully connected to Oewang Workspace! You can now send receipts or ask me questions.`,
        );
        return;
      }

      // 2. Otherwise, look up integration by phone number
      const integration = await IntegrationsRepository.findByWhatsAppNumber(
        senderNumber,
        "whatsapp-web",
      );
      if (!integration) {
        await globalClient?.sendMessage(
          from,
          "❌ You are not connected to Oewang. Please send 'Connect Oewang <your-workspace-id>' to connect.",
        );
        return;
      }

      const workspaceId = integration.workspaceId;
      const userId =
        (integration.settings as any)?.connectedByUserId ||
        (await IntegrationsRepository.findFirstMemberId(workspaceId));

      if (!userId) return;

      if (hasMedia) {
        // ── Handle image / document (receipt) ─────────────────────────────
        const media = await msg.downloadMedia();
        if (!media) {
          await globalClient?.sendMessage(
            from,
            "❌ Could not download the file. Please try again.",
          );
          return;
        }

        const mimeType = media.mimetype || "image/jpeg";
        const base64Image = media.data; // already base64

        const buffer = Buffer.from(base64Image, "base64");
        let vaultFile;
        try {
          vaultFile = await vaultService.uploadFile(workspaceId, userId, {
            name: `receipt-${Date.now()}.${mimeType === "application/pdf" ? "pdf" : "jpg"}`,
            type: mimeType,
            size: buffer.byteLength,
            buffer,
          });
        } catch (uploadErr: any) {
          log.warn(
            `[WA-Web] Failed to upload receipt to Vault (e.g. storage limit)`,
            { err: uploadErr },
          );
        }

        // Parse with AI
        const parsedReceipt = await AiService.parseReceipt(
          workspaceId,
          userId,
          base64Image,
          mimeType,
        );

        if (parsedReceipt?.amount) {
          const walletsResult = await walletsRepository.findMany(workspaceId);
          const wallets = walletsResult.rows;
          if (wallets.length > 0) {
            const defaultWallet = wallets[0];
            if (!defaultWallet) {
              await globalClient?.sendMessage(
                from,
                "❌ No wallet found to record the expense.",
              );
              return;
            }

            const transactionRes = await TransactionsService.create(
              workspaceId,
              userId,
              {
                walletId: defaultWallet.id,
                amount: parsedReceipt.amount,
                date: parsedReceipt.date || new Date().toISOString(),
                type: "expense",
                name: parsedReceipt.name || "Expense",
                description: "Parsed automatically from WhatsApp (Web) Receipt",
                categoryId: parsedReceipt.categoryId,
                attachmentIds: vaultFile ? [vaultFile.id] : undefined,
              },
            );

            // Save line items if extracted
            if (parsedReceipt.items && parsedReceipt.items.length > 0) {
              const transactionId = (transactionRes as any).data?.id;
              if (transactionId) {
                await TransactionItemsService.bulkCreate(
                  workspaceId,
                  userId,
                  transactionId,
                  parsedReceipt.items as any,
                );
              }
            }

            const amountStr = Number(parsedReceipt.amount).toLocaleString();
            const itemsCount = parsedReceipt.items?.length || 0;
            const reply =
              `✅ Added expense: *${parsedReceipt.name || "Receipt"}* for ${amountStr}` +
              (itemsCount > 0 ? ` — ${itemsCount} line items recorded!` : "") +
              (vaultFile ? "\n📎 Receipt saved to Vault." : "");

            await globalClient?.sendMessage(from, reply);
          }
        } else {
          await globalClient?.sendMessage(
            from,
            "❌ Sorry, I couldn't extract receipt data from that image. Try sending a clearer photo.",
          );
        }
      } else if (text) {
        // ── AI Chat ────────────────────────────────────────────────────────
        const chatSessionId = (integration.settings as any)?.chatSessionId;

        const chatResponse = await AiService.chat(
          [{ role: "user", content: text }],
          workspaceId,
          userId,
          chatSessionId,
        );

        if (chatResponse?.reply) {
          // Persist updated session ID
          if (
            chatResponse.sessionId &&
            chatResponse.sessionId !== chatSessionId
          ) {
            await IntegrationsRepository.updateSettings(
              integration.id,
              workspaceId,
              {
                ...((integration.settings as any) || {}),
                chatSessionId: chatResponse.sessionId,
              },
            );
          }
          await globalClient?.sendMessage(from, chatResponse.reply);
        }
      }
    } catch (err) {
      log.error("[WA-Web] Error handling incoming message", {
        err,
        senderNumber,
      });
      try {
        await globalClient?.sendMessage(
          from,
          "❌ Sorry, I encountered an error processing your message.",
        );
      } catch {
        // ignore send errors in error handler
      }
    }
  }
}
