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

const OUTLOOK_AUTH_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const OUTLOOK_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const OUTLOOK_SCOPES = [
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
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

export abstract class OutlookService {
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
    const clientId = Env.MICROSOFT_CLIENT_ID;
    if (!clientId) throw new Error("MICROSOFT_CLIENT_ID not configured");

    const redirectUri = `${Env.NEXT_PUBLIC_API_URL}/v1/integrations/outlook/oauth-callback`;
    const state = OutlookService.encryptState({
      workspaceId,
      userId,
      provider: "outlook",
      ts: Date.now(),
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: OUTLOOK_SCOPES,
      response_mode: "query",
      state,
    });

    return `${OUTLOOK_AUTH_URL}?${params.toString()}`;
  }

  static async handleOAuthCallback(
    code: string,
    state: string,
  ): Promise<{ workspaceId: string; userId: string }> {
    const decoded = OutlookService.decryptState(state);
    const { workspaceId, userId } = decoded;
    if (!workspaceId || !userId) throw new Error("Invalid OAuth state");

    const clientId = Env.MICROSOFT_CLIENT_ID!;
    const clientSecret = Env.MICROSOFT_CLIENT_SECRET!;
    const redirectUri = `${Env.NEXT_PUBLIC_API_URL}/v1/integrations/outlook/oauth-callback`;

    const tokenRes = await fetch(OUTLOOK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: OUTLOOK_SCOPES,
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Outlook token exchange failed: ${await tokenRes.text()}`);
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const profileRes = await fetch(`${GRAPH_API_BASE}/me?$select=mail,userPrincipalName`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = (await profileRes.json()) as {
      mail?: string;
      userPrincipalName?: string;
    };
    const email = profile.mail || profile.userPrincipalName || "";

    const expiryDate = Date.now() + tokens.expires_in * 1000;

    await IntegrationsRepository.upsert({
      workspaceId,
      provider: "outlook",
      settings: {
        email,
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
      title: "Outlook Connected",
      message: `Outlook (${email}) connected. Scanning your inbox for receipts…`,
      link: "/apps",
    }).catch((err) => logger.error("Outlook connected notification failed", { err }));

    OutlookService.syncInbox(workspaceId, userId).catch((err) =>
      logger.error("Outlook initial sync failed", { err, workspaceId }),
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
    if (!refreshToken) throw new Error("No Outlook refresh token — re-auth required");

    const res = await fetch(OUTLOOK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Env.MICROSOFT_CLIENT_ID!,
        client_secret: Env.MICROSOFT_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: OUTLOOK_SCOPES,
      }),
    });

    if (!res.ok) throw new Error(`Outlook token refresh failed: ${await res.text()}`);

    const refreshed = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    const newExpiry = Date.now() + refreshed.expires_in * 1000;
    const newSettings: any = {
      ...settings,
      accessToken: encryptAtRest(refreshed.access_token),
      expiryDate: newExpiry,
    };
    if (refreshed.refresh_token) {
      newSettings.refreshToken = encryptAtRest(refreshed.refresh_token);
    }

    await IntegrationsRepository.updateSettings(
      integration.id,
      integration.workspaceId,
      newSettings,
    );

    return refreshed.access_token;
  }

  // ── Sync ───────────────────────────────────────────────────────────────────

  static async syncInbox(workspaceId: string, userId: string): Promise<void> {
    const integration = await IntegrationsRepository.findByProvider(workspaceId, "outlook");
    if (!integration?.isActive) return;

    const settings = integration.settings as any;
    const accessToken = await OutlookService.getValidAccessToken(integration);

    const lastSyncAt = settings.lastSyncAt
      ? new Date(settings.lastSyncAt as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const processedIds: string[] = settings.processedMessageIds || [];

    // OData filter: messages with attachments received after lastSyncAt, not from self
    const filterDate = lastSyncAt.toISOString();
    const filter = `hasAttachments eq true and receivedDateTime ge ${filterDate}`;
    const select =
      "id,subject,from,receivedDateTime,hasAttachments,isDraft,isSent";
    const url = `${GRAPH_API_BASE}/me/messages?$filter=${encodeURIComponent(filter)}&$orderby=receivedDateTime desc&$top=50&$select=${select}`;

    const listRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!listRes.ok) {
      logger.error("Outlook list messages failed", {
        status: listRes.status,
        body: await listRes.text(),
        workspaceId,
      });
      return;
    }

    const listData = (await listRes.json()) as { value?: any[] };
    const messages = (listData.value || []).filter(
      (m: any) => !m.isDraft && !m.isSent,
    );

    const newProcessedIds = [...processedIds];
    let synced = 0;

    for (const message of messages) {
      if (processedIds.includes(message.id)) continue;
      try {
        await OutlookService.processMessage(
          workspaceId,
          userId,
          accessToken,
          message.id,
          settings.email as string,
        );
        newProcessedIds.push(message.id);
        synced++;
      } catch (err) {
        logger.error("Outlook message processing failed", {
          err,
          messageId: message.id,
          workspaceId,
        });
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
        title: "Outlook Synced",
        message: `Processed ${synced} new receipt${synced > 1 ? "s" : ""} from Outlook.`,
        link: "/transactions",
      }).catch(() => {});
    }

    logger.info("Outlook sync complete", { workspaceId, synced, total: messages.length });
  }

  private static async processMessage(
    workspaceId: string,
    userId: string,
    accessToken: string,
    messageId: string,
    userEmail: string,
  ): Promise<void> {
    const attRes = await fetch(
      `${GRAPH_API_BASE}/me/messages/${messageId}/attachments`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!attRes.ok) return;

    const attData = (await attRes.json()) as { value?: any[] };
    const attachments = attData.value || [];

    for (const att of attachments) {
      const mimeType: string = att.contentType || "";
      if (!ALLOWED_MIME_TYPES.has(mimeType)) continue;
      if ((att.size || 0) > MAX_ATTACHMENT_BYTES) continue;

      // contentBytes is base64-encoded and included in the response for file attachments
      const contentBytes: string = att.contentBytes;
      if (!contentBytes) continue;

      const buffer = Buffer.from(contentBytes, "base64");
      const ext = mimeType === "application/pdf" ? "pdf" : (mimeType.split("/")[1] ?? "jpg");
      const filename = (att.name as string) || `attachment-${Date.now()}.${ext}`;

      await OutlookService.processAttachment(
        workspaceId,
        userId,
        buffer,
        mimeType,
        filename,
        userEmail,
      );
    }
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
      name: parsedReceipt.name || "Expense from Outlook",
      description: "Imported automatically from Outlook",
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
      "Outlook",
    ).catch(() => {});
  }
}
