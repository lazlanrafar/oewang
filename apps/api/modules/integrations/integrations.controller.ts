import { Elysia, t } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { IntegrationsService } from "./integrations.service";
import { IntegrationsRepository } from "./integrations.repository";
import { ConnectWhatsAppDto, MetaWhatsAppWebhookDto } from "./integrations.dto";
import { logger } from "@workspace/logger";

export const integrationsController = new Elysia({ prefix: "/integrations" })
  .use(encryptionPlugin)
  // Public webhook route for Twilio
  // Webhook for Meta WhatsApp Business API
  .get(
    "/whatsapp/webhook",
    ({ query }) => {
      const mode = query["hub.mode"];
      const token = query["hub.verify_token"];
      const challenge = query["hub.challenge"];

      logger.info("[WhatsApp Webhook] Verification request", { mode, token, challenge });

      if (
        mode === "subscribe" &&
        token === IntegrationsService.getVerifyToken()
      ) {
        return challenge;
      }
      throw Error("Forbidden");
    },
    {
      query: t.Object({
        "hub.mode": t.Optional(t.String()),
        "hub.verify_token": t.Optional(t.String()),
        "hub.challenge": t.Optional(t.String()),
      }),
      detail: {
        summary: "WhatsApp Webhook Verification",
        description: "Endpoint for Meta to verify the WhatsApp webhook using a challenge-response pattern.",
        tags: ["Integrations"],
      },
    },
  )
  .post(
    "/whatsapp/twilio/webhook",
    async ({ body }) => {
      // Twilio sends form-urlencoded data, Elysia parses it if configured or using t.Any()
      IntegrationsService.handleTwilioWhatsAppWebhook(body).catch((error) => logger.error("Twilio WhatsApp webhook error", { error }));
      return "OK";
    },
    {
      body: t.Any(),
      detail: {
        summary: "WhatsApp Webhook (Twilio)",
        description: "Receives incoming messages and events from the Twilio WhatsApp API.",
        tags: ["Integrations"],
      },
    },
  )
  .post(
    "/whatsapp/webhook",
    async ({ body }) => {
      // Meta payload is deeply nested under entry > changes > value
      IntegrationsService.handleMetaWhatsAppWebhook(body).catch((error) => logger.error("WhatsApp webhook error", { error }));
      return "OK";
    },
    {
      body: MetaWhatsAppWebhookDto,
      detail: {
        summary: "WhatsApp Webhook (Meta)",
        description: "Receives incoming messages and events from the WhatsApp Business API (Meta).",
        tags: ["Integrations"],
      },
    },
  )
  .post(
    "/telegram/webhook",
    async ({ body }) => {
      IntegrationsService.handleTelegramWebhook(body).catch((error) => logger.error("Telegram webhook error", { error }));
      return "OK";
    },
    {
      body: t.Any(),
      detail: {
        summary: "Telegram Webhook",
        description: "Receives incoming messages and events from the Telegram Bot API.",
        tags: ["Integrations"],
      },
    },
  )
  // Authenticated route for connecting phone number
  .use(authPlugin)
  .get(
    "/",
    async ({ auth }) => {
      if (!auth?.workspace_id) throw Error("Unauthorized");
      return await IntegrationsService.getAll(auth.workspace_id);
    },
    {
      detail: {
        summary: "List Integrations",
        description: "Returns a list of all active third-party integrations (WhatsApp, Telegram, etc.) for the workspace.",
        tags: ["Integrations"],
      },
    },
  )
  .post(
    "/whatsapp/connect",
    async ({ body, auth }) => {
      if (!auth?.workspace_id || !auth?.user_id) throw Error("Unauthorized");
      return await IntegrationsService.connectWhatsApp(
        auth.workspace_id,
        auth.user_id,
        body.phoneNumber,
      );
    },
    {
      body: ConnectWhatsAppDto,
      detail: {
        summary: "Connect WhatsApp",
        description: "Initiates the connection process for a WhatsApp Business account.",
        tags: ["Integrations"],
      },
    },
  )
  .post(
    "/telegram/connect",
    async ({ body, auth }) => {
      if (!auth?.workspace_id || !auth?.user_id) throw Error("Unauthorized");
      return await IntegrationsService.connectTelegram(
        auth.workspace_id,
        auth.user_id,
        body.chatId,
      );
    },
    {
      body: t.Object({ chatId: t.String() }),
      detail: {
        summary: "Connect Telegram",
        description: "Links a Telegram chat ID to the workspace for AI-powered chat and notifications.",
        tags: ["Integrations"],
      },
    },
  );
