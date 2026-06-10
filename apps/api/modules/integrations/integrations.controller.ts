import { Env } from "@workspace/constants";
import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { Elysia, status, t } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { assertCanManageSensitiveWorkspace } from "../workspaces/workspace-permissions";
import { ConnectWhatsAppDto } from "./integrations.dto";
import { GmailService } from "./gmail.service";
import { OutlookService } from "./outlook.service";
import { IntegrationsService } from "./integrations.service";
import { logger } from "@workspace/logger";

const APP_URL = () => Env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const integrationsController = new Elysia({ prefix: "/integrations" })
  // ── Public OAuth callbacks (no auth cookie — browser redirect from provider) ──

  .get(
    "/gmail/oauth-callback",
    async ({ query, set }) => {
      const { code, state, error } = query as Record<string, string>;

      if (error || !code || !state) {
        set.redirect = `${APP_URL()}/en/apps?error=gmail`;
        set.status = 302;
        return;
      }

      try {
        await GmailService.handleOAuthCallback(code, state);
        set.redirect = `${APP_URL()}/en/apps?connected=gmail`;
      } catch (err) {
        logger.error("Gmail OAuth callback failed", { err });
        set.redirect = `${APP_URL()}/en/apps?error=gmail`;
      }

      set.status = 302;
    },
    {
      detail: {
        summary: "Gmail OAuth Callback",
        description: "Handles the OAuth redirect from Google after user grants Gmail access.",
        tags: ["Integrations"],
      },
    },
  )

  .get(
    "/outlook/oauth-callback",
    async ({ query, set }) => {
      const { code, state, error } = query as Record<string, string>;

      if (error || !code || !state) {
        set.redirect = `${APP_URL()}/en/apps?error=outlook`;
        set.status = 302;
        return;
      }

      try {
        await OutlookService.handleOAuthCallback(code, state);
        set.redirect = `${APP_URL()}/en/apps?connected=outlook`;
      } catch (err) {
        logger.error("Outlook OAuth callback failed", { err });
        set.redirect = `${APP_URL()}/en/apps?error=outlook`;
      }

      set.status = 302;
    },
    {
      detail: {
        summary: "Outlook OAuth Callback",
        description:
          "Handles the OAuth redirect from Microsoft after user grants Outlook access.",
        tags: ["Integrations"],
      },
    },
  )

  // ── Authenticated routes ───────────────────────────────────────────────────

  .use(authPlugin)

  .get(
    "/",
    async ({ auth }) => {
      if (!auth?.workspaceId) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      return await IntegrationsService.getAll(auth.workspaceId);
    },
    {
      detail: {
        summary: "List Integrations",
        tags: ["Integrations"],
      },
    },
  )

  // ── Gmail ──────────────────────────────────────────────────────────────────

  .get(
    "/gmail/install-url",
    async ({ auth, set }) => {
      if (!auth?.workspaceId || !auth?.user_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanManageSensitiveWorkspace(auth.workspace_role);

      try {
        const url = GmailService.getInstallUrl(auth.workspaceId, auth.user_id);
        return buildSuccess({ url }, "Gmail install URL generated");
      } catch (err: any) {
        set.status = 500;
        return buildError(ErrorCode.INTERNAL_ERROR, err.message || "Failed to generate Gmail install URL");
      }
    },
    {
      detail: {
        summary: "Get Gmail OAuth URL",
        description: "Generates the Google OAuth consent URL to connect a Gmail account.",
        tags: ["Integrations"],
      },
    },
  )

  .post(
    "/gmail/sync",
    async ({ auth }) => {
      if (!auth?.workspaceId || !auth?.user_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }

      GmailService.syncInbox(auth.workspaceId, auth.user_id).catch((err) =>
        logger.error("Gmail manual sync failed", { err, workspaceId: auth.workspaceId }),
      );

      return buildSuccess(null, "Gmail sync started");
    },
    {
      detail: {
        summary: "Sync Gmail Inbox",
        description: "Triggers a manual inbox scan for receipt/invoice emails.",
        tags: ["Integrations"],
      },
    },
  )

  // ── Outlook ────────────────────────────────────────────────────────────────

  .get(
    "/outlook/install-url",
    async ({ auth, set }) => {
      if (!auth?.workspaceId || !auth?.user_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanManageSensitiveWorkspace(auth.workspace_role);

      try {
        const url = OutlookService.getInstallUrl(auth.workspaceId, auth.user_id);
        return buildSuccess({ url }, "Outlook install URL generated");
      } catch (err: any) {
        set.status = 500;
        return buildError(ErrorCode.INTERNAL_ERROR, err.message || "Failed to generate Outlook install URL");
      }
    },
    {
      detail: {
        summary: "Get Outlook OAuth URL",
        description: "Generates the Microsoft OAuth consent URL to connect an Outlook account.",
        tags: ["Integrations"],
      },
    },
  )

  .post(
    "/outlook/sync",
    async ({ auth }) => {
      if (!auth?.workspaceId || !auth?.user_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }

      OutlookService.syncInbox(auth.workspaceId, auth.user_id).catch((err) =>
        logger.error("Outlook manual sync failed", { err, workspaceId: auth.workspaceId }),
      );

      return buildSuccess(null, "Outlook sync started");
    },
    {
      detail: {
        summary: "Sync Outlook Inbox",
        description: "Triggers a manual inbox scan for receipt/invoice emails.",
        tags: ["Integrations"],
      },
    },
  )

  // ── WhatsApp / Telegram connect ────────────────────────────────────────────

  .post(
    "/whatsapp/connect",
    async ({ body, auth }) => {
      if (!auth?.workspaceId || !auth?.user_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanManageSensitiveWorkspace(auth.workspace_role);
      return await IntegrationsService.connectWhatsApp(
        auth.workspaceId,
        auth.user_id,
        body.phoneNumber,
      );
    },
    {
      body: ConnectWhatsAppDto,
      detail: {
        summary: "Connect WhatsApp",
        tags: ["Integrations"],
      },
    },
  )

  .post(
    "/telegram/connect",
    async ({ body, auth }) => {
      if (!auth?.workspaceId || !auth?.user_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanManageSensitiveWorkspace(auth.workspace_role);
      return await IntegrationsService.connectTelegram(
        auth.workspaceId,
        auth.user_id,
        body.chatId,
      );
    },
    {
      body: t.Object({ chatId: t.String() }),
      detail: {
        summary: "Connect Telegram",
        tags: ["Integrations"],
      },
    },
  )

  .post(
    "/:provider/disconnect",
    async ({ params, auth }) => {
      if (!auth?.workspaceId) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanManageSensitiveWorkspace(auth.workspace_role);

      return await IntegrationsService.disconnectIntegration(
        auth.workspaceId,
        params.provider,
        auth.user_id,
      );
    },
    {
      params: t.Object({ provider: t.String() }),
      detail: {
        summary: "Disconnect Integration",
        tags: ["Integrations"],
      },
    },
  );
