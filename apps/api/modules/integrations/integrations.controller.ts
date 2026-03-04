import { Elysia } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { IntegrationsService } from "./integrations.service";
import { IntegrationsRepository } from "./integrations.repository";
import { ConnectWhatsAppDto, TwilioWebhookDto } from "./integrations.dto";

export const integrationsController = new Elysia({ prefix: "/integrations" })
  .use(encryptionPlugin)
  // Public webhook route for Twilio
  .post(
    "/whatsapp/webhook",
    async ({ body }) => {
      // Background process the webhook so we can return OK instantly to Twilio
      IntegrationsService.handleWhatsAppWebhook(body).catch(console.error);
      // return "OK";
    },
    {
      body: TwilioWebhookDto,
      detail: { summary: "WhatsApp Webhook", tags: ["Integrations"] },
    },
  )
  // Authenticated route for connecting phone number
  .use(authPlugin)
  .get(
    "/",
    async ({ auth }) => {
      if (!auth?.workspace_id) {
        throw Error("Unauthorized");
      }
      const integrations = await IntegrationsRepository.findAll(
        auth.workspace_id,
      );
      return { success: true, data: integrations, code: "OK" };
    },
    { detail: { summary: "List Integrations", tags: ["Integrations"] } },
  )
  .post(
    "/whatsapp/connect",
    async ({ body, auth }) => {
      if (!auth?.workspace_id || !auth?.user_id) {
        throw Error("Unauthorized");
      }
      const result = await IntegrationsService.connectWhatsApp(
        auth.workspace_id,
        auth.user_id,
        body.phoneNumber,
      );
      return result;
    },
    {
      body: ConnectWhatsAppDto,
      detail: { summary: "Connect WhatsApp", tags: ["Integrations"] },
    },
  );
