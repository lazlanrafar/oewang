import { Env } from "@workspace/constants";
import { decryptAtRest, encryptAtRest } from "../../lib/at-rest-crypto";
import { logger } from "@workspace/logger";
import { sendReceiptProcessedEmail } from "@workspace/email";
import { cacheDel } from "../../lib/cache";
import { AiService } from "../ai/ai.service";
import { NotificationsService } from "../notifications/notifications.service";
import { TransactionItemsService } from "../transactions/items/transaction-items.service";
import { TransactionsService } from "../transactions/transactions.service";
import { VaultService as vaultService } from "../vault/vault.service";
import { WalletsRepository as walletsRepository } from "../wallets/wallets.repository";
import { IntegrationsRepository } from "./integrations.repository";

// Fall back to the generic Google OAuth credential when Gmail-specific vars aren't set.
// One OAuth client can cover both Google login and Gmail API — just add the Gmail scopes
// and redirect URI to the same client in Google Cloud Console.
const gmailClientId = () => Env.GOOGLE_GMAIL_CLIENT_ID ?? Env.GOOGLE_CLIENT_ID;
const gmailClientSecret = () => Env.GOOGLE_GMAIL_CLIENT_SECRET ?? Env.GOOGLE_CLIENT_SECRET;

const GMAIL_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_PROCESSED_IDS = 500;
const integrationsKey = (workspaceId: string) => `oewang:integrations:${workspaceId}`;

export abstract class GmailService {
  // ── State ──────────────────────────────────────────────────────────────────

  static encryptState(data: object): string {
    return Buffer.from(encryptAtRest(JSON.stringify(data))).toString(
      "base64url",
    );
  }

  static decryptState(state: string): Record<string, string> {
    const raw = Buffer.from(state, "base64url").toString("utf8");
    return JSON.parse(decryptAtRest(raw));
  }

  // ── OAuth ──────────────────────────────────────────────────────────────────

  static getInstallUrl(workspaceId: string, userId: string): string {
    const clientId = gmailClientId();
    if (!clientId) throw new Error("Google OAuth client ID not configured (set GOOGLE_GMAIL_CLIENT_ID or GOOGLE_CLIENT_ID)");

    const redirectUri = `${Env.NEXT_PUBLIC_API_URL}/v1/integrations/gmail/oauth-callback`;
    const state = GmailService.encryptState({
      workspaceId,
      userId,
      provider: "gmail",
      ts: Date.now(),
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GMAIL_SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    });

    return `${GMAIL_AUTH_URL}?${params.toString()}`;
  }

  static async handleOAuthCallback(
    code: string,
    state: string,
  ): Promise<{ workspaceId: string; userId: string }> {
    const decoded = GmailService.decryptState(state);
    const { workspaceId, userId } = decoded;
    if (!workspaceId || !userId) throw new Error("Invalid OAuth state");

    const clientId = gmailClientId()!;
    const clientSecret = gmailClientSecret()!;
    const redirectUri = `${Env.NEXT_PUBLIC_API_URL}/v1/integrations/gmail/oauth-callback`;

    const tokenRes = await fetch(GMAIL_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Gmail token exchange failed: ${await tokenRes.text()}`);
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const profileRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    const profile = (await profileRes.json()) as { email: string };

    const expiryDate = Date.now() + tokens.expires_in * 1000;

    await IntegrationsRepository.upsert({
      workspaceId,
      provider: "gmail",
      settings: {
        email: profile.email,
        accessToken: encryptAtRest(tokens.access_token),
        refreshToken: tokens.refresh_token
          ? encryptAtRest(tokens.refresh_token)
          : null,
        expiryDate,
        lastSyncAt: null,
        processedMessageIds: [],
      },
      isActive: true,
      connectedBy: userId,
    });

    await cacheDel(integrationsKey(workspaceId));

    NotificationsService.create({
      workspace_id: workspaceId,
      user_id: userId,
      type: "integration.connected",
      title: "Gmail Connected",
      message: `Gmail (${profile.email}) connected. Scanning your inbox for receipts…`,
      link: "/apps",
    }).catch((err) => logger.error("Gmail connected notification failed", { err }));

    GmailService.syncInbox(workspaceId, userId).catch((err) =>
      logger.error("Gmail initial sync failed", { err, workspaceId }),
    );

    return { workspaceId, userId };
  }

  // ── Token ──────────────────────────────────────────────────────────────────

  private static async getValidAccessToken(integration: any): Promise<string> {
    const settings = integration.settings as any;
    const accessToken = decryptAtRest(settings.accessToken);
    const expiryDate = settings.expiryDate as number;

    if (expiryDate && Date.now() < expiryDate - TOKEN_EXPIRY_BUFFER_MS) {
      return accessToken;
    }

    const refreshToken = settings.refreshToken
      ? decryptAtRest(settings.refreshToken)
      : null;
    if (!refreshToken) throw new Error("No Gmail refresh token — re-auth required");

    const res = await fetch(GMAIL_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: gmailClientId()!,
        client_secret: gmailClientSecret()!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) throw new Error(`Gmail token refresh failed: ${await res.text()}`);

    const refreshed = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    const newExpiry = Date.now() + refreshed.expires_in * 1000;

    await IntegrationsRepository.updateSettings(
      integration.id,
      integration.workspaceId,
      {
        ...settings,
        accessToken: encryptAtRest(refreshed.access_token),
        expiryDate: newExpiry,
      },
    );

    return refreshed.access_token;
  }

  // ── Sync ───────────────────────────────────────────────────────────────────

  static async syncInbox(workspaceId: string, userId: string): Promise<void> {
    const integration = await IntegrationsRepository.findByProvider(workspaceId, "gmail");
    if (!integration?.isActive) return;

    const settings = integration.settings as any;
    const accessToken = await GmailService.getValidAccessToken(integration);

    const lastSyncAt = settings.lastSyncAt
      ? new Date(settings.lastSyncAt as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const processedIds: string[] = settings.processedMessageIds || [];

    const d = lastSyncAt;
    const dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
    const query = `has:attachment -from:me after:${dateStr}`;

    const listRes = await fetch(
      `${GMAIL_API_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!listRes.ok) {
      logger.error("Gmail list messages failed", { status: listRes.status, workspaceId });
      return;
    }

    const listData = (await listRes.json()) as { messages?: { id: string }[] };
    const messages = listData.messages || [];
    const newProcessedIds = [...processedIds];
    let synced = 0;

    for (const { id } of messages) {
      if (processedIds.includes(id)) continue;
      try {
        await GmailService.processMessage(
          workspaceId,
          userId,
          accessToken,
          id,
          settings.email as string,
        );
        newProcessedIds.push(id);
        synced++;
      } catch (err) {
        logger.error("Gmail message processing failed", { err, messageId: id, workspaceId });
      }
    }

    await IntegrationsRepository.updateSettings(integration.id, workspaceId, {
      ...settings,
      lastSyncAt: new Date().toISOString(),
      processedMessageIds: newProcessedIds.slice(-MAX_PROCESSED_IDS),
    });

    if (synced > 0) {
      NotificationsService.create({
        workspace_id: workspaceId,
        user_id: userId,
        type: "inbox.synced",
        title: "Gmail Synced",
        message: `Processed ${synced} new receipt${synced > 1 ? "s" : ""} from Gmail.`,
        link: "/transactions",
      }).catch(() => {});
    }

    logger.info("Gmail sync complete", { workspaceId, synced, total: messages.length });
  }

  private static async processMessage(
    workspaceId: string,
    userId: string,
    accessToken: string,
    messageId: string,
    userEmail: string,
  ): Promise<void> {
    const msgRes = await fetch(`${GMAIL_API_BASE}/messages/${messageId}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!msgRes.ok) return;

    const msg = (await msgRes.json()) as any;
    const parts = GmailService.flattenParts(msg.payload);

    for (const part of parts) {
      const mimeType: string = part.mimeType || "";
      if (!ALLOWED_MIME_TYPES.has(mimeType)) continue;

      const attachmentId: string = part.body?.attachmentId;
      const size: number = part.body?.size || 0;
      if (!attachmentId || size > MAX_ATTACHMENT_BYTES) continue;

      const attRes = await fetch(
        `${GMAIL_API_BASE}/messages/${messageId}/attachments/${attachmentId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!attRes.ok) continue;

      const attData = (await attRes.json()) as { data: string };
      // Gmail uses base64url — convert to standard base64
      const base64std = attData.data.replace(/-/g, "+").replace(/_/g, "/");
      const buffer = Buffer.from(base64std, "base64");
      const ext = mimeType === "application/pdf" ? "pdf" : (mimeType.split("/")[1] ?? "jpg");
      const filename = (part.filename as string) || `attachment-${Date.now()}.${ext}`;

      await GmailService.processAttachment(
        workspaceId,
        userId,
        buffer,
        mimeType,
        filename,
        userEmail,
      );
    }
  }

  private static flattenParts(payload: any): any[] {
    if (!payload) return [];
    const parts: any[] = [];
    if (payload.filename && payload.body?.attachmentId) parts.push(payload);
    for (const part of (payload.parts as any[]) || []) {
      parts.push(...GmailService.flattenParts(part));
    }
    return parts;
  }

  private static async processAttachment(
    workspaceId: string,
    userId: string,
    buffer: Buffer,
    mimeType: string,
    filename: string,
    userEmail: string,
  ): Promise<void> {
    const base64 = buffer.toString("base64");

    const vaultFile = await vaultService.uploadFile(workspaceId, userId, {
      name: filename,
      type: mimeType,
      size: buffer.byteLength,
      buffer,
    });
    if (!vaultFile) return;

    const parsedReceipt = await AiService.parseReceipt(workspaceId, userId, base64, mimeType);
    if (!parsedReceipt?.amount) return;

    const walletsResult = await walletsRepository.findMany(workspaceId);
    if (!walletsResult.rows.length) return;

    const defaultWallet = walletsResult.rows[0]!;
    const transactionRes = await TransactionsService.create(workspaceId, userId, {
      walletId: defaultWallet.id,
      amount: parsedReceipt.amount,
      date: parsedReceipt.date || new Date().toISOString(),
      type: "expense",
      name: parsedReceipt.name || "Expense from Gmail",
      description: "Imported automatically from Gmail",
      categoryId: parsedReceipt.categoryId,
      attachmentIds: [vaultFile.id],
    });

    if (parsedReceipt.items?.length) {
      const transactionId = (transactionRes as any)?.data?.id;
      if (transactionId) {
        await TransactionItemsService.bulkCreate(
          workspaceId,
          userId,
          transactionId,
          parsedReceipt.items as any,
        );
      }
    }

    sendReceiptProcessedEmail(
      userEmail,
      parsedReceipt.name || "Expense",
      Number(parsedReceipt.amount).toLocaleString("id-ID"),
      "Gmail",
    ).catch(() => {});
  }
}
