import { Elysia, t } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { IntegrationsService } from "./integrations.service";
import { ConnectWhatsAppDto } from "./integrations.dto";
import { logger } from "@workspace/logger";
import { Env } from "@workspace/constants";
import { status } from "elysia";
import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import {
  getPublicRequestUrl,
  parseFormBody,
  verifyTelegramSecret,
  verifyTwilioSignature,
} from "./webhook-security";
import { assertCanManageSensitiveWorkspace } from "../workspaces/workspace-permissions";

export const integrationsController = new Elysia({ prefix: "/integrations" })
  // Public webhook route for Twilio WhatsApp
  .post(
    "/whatsapp/twilio/webhook",
    async ({ request, headers, set }) => {
      const signatureHeader = headers["x-twilio-signature"];
      const authToken = Env.TWILIO_AUTH_TOKEN;
      const rawBody = await request.text();
      const formBody = parseFormBody(rawBody);

      if (process.env.NODE_ENV === "production" && !authToken) {
        set.status = 500;
        return "Twilio webhook is not configured";
      }

      if (!authToken || typeof signatureHeader !== "string") {
        set.status = 403;
        return "Forbidden";
      }

      const webhookUrl = getPublicRequestUrl(request);
      const isValid = verifyTwilioSignature({
        authToken,
        signatureHeader,
        url: webhookUrl,
        formBody,
      });

      if (!isValid) {
        set.status = 403;
        return "Forbidden";
      }

      IntegrationsService.handleTwilioWhatsAppWebhook(formBody).catch((error) =>
        logger.error("Twilio WhatsApp webhook error", { error }),
      );
      return "OK";
    },
    {
      detail: {
        summary: "WhatsApp Webhook (Twilio)",
        description:
          "Receives incoming messages and events from the Twilio WhatsApp API.",
        tags: ["Integrations"],
      },
    },
  )
  .post(
    "/telegram/webhook",
    async ({ request, set, body }) => {
      const expectedSecret = Env.TELEGRAM_WEBHOOK_SECRET;
      const receivedSecret = request.headers.get(
        "x-telegram-bot-api-secret-token",
      );

      if (process.env.NODE_ENV === "production" && !expectedSecret) {
        set.status = 500;
        return "Telegram webhook is not configured";
      }

      if (expectedSecret) {
        const isValid = verifyTelegramSecret({
          expectedSecret,
          receivedSecret,
        });

        if (!isValid) {
          set.status = 403;
          return "Forbidden";
        }
      }

      let parsedBody: Record<string, any>;

      if (body && typeof body === "object") {
        parsedBody = body as Record<string, any>;
      } else if (typeof body === "string") {
        try {
          parsedBody = JSON.parse(body);
        } catch {
          set.status = 400;
          return "Invalid JSON payload";
        }
      } else {
        set.status = 400;
        return "Invalid JSON payload";
      }

      IntegrationsService.handleTelegramWebhook(parsedBody).catch((error) =>
        logger.error("Telegram webhook error", { error }),
      );
      return "OK";
    },
    {
      detail: {
        summary: "Telegram Webhook",
        description:
          "Receives incoming messages and events from the Telegram Bot API.",
        tags: ["Integrations"],
      },
    },
  )
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
        description:
          "Returns a list of all active third-party integrations (WhatsApp, Telegram, etc.) for the workspace.",
        tags: ["Integrations"],
      },
    },
  )
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
        description:
          "Initiates the connection process for a WhatsApp Business account.",
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
        description:
          "Links a Telegram chat ID to the workspace for AI-powered chat and notifications.",
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
        description:
          "Disconnects an installed integration from the current workspace.",
        tags: ["Integrations"],
      },
    },
  );
