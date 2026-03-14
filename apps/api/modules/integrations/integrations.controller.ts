import { Elysia, t } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { IntegrationsService } from "./integrations.service";
import { IntegrationsRepository } from "./integrations.repository";
import { ConnectWhatsAppDto, MetaWhatsAppWebhookDto } from "./integrations.dto";

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

      console.log(mode, token, challenge);

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
    },
  )
  .post(
    "/whatsapp/webhook",
    async ({ body }) => {
      // Meta payload is deeply nested under entry > changes > value
      IntegrationsService.handleMetaWhatsAppWebhook(body).catch(console.error);
      return "OK";
    },
    {
      body: MetaWhatsAppWebhookDto,
      detail: { summary: "WhatsApp Webhook", tags: ["Integrations"] },
    },
  )
  .post(
    "/telegram/webhook",
    async ({ body }) => {
      IntegrationsService.handleTelegramWebhook(body).catch(console.error);
      return "OK";
    },
    {
      body: t.Any(),
      detail: { summary: "Telegram Webhook", tags: ["Integrations"] },
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
    { detail: { summary: "List Integrations", tags: ["Integrations"] } },
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
      detail: { summary: "Connect WhatsApp", tags: ["Integrations"] },
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
      detail: { summary: "Connect Telegram", tags: ["Integrations"] },
    },
  );
