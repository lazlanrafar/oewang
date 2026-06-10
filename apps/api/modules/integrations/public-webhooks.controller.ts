import { Env } from "@workspace/constants";
import { logger } from "@workspace/logger";
import { Elysia } from "elysia";
import { IntegrationsService } from "./integrations.service";
import { verifyTelegramSecret } from "./webhook-security";

export const publicWebhooksController = new Elysia({ prefix: "/integrations" })
  .post(
    "/whatsapp/webhook",
    async ({ set, body }) => {
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

      IntegrationsService.handleEvolutionWhatsAppWebhook(parsedBody).catch(
        (error) => logger.error("Evolution WhatsApp webhook error", { error }),
      );
      return "OK";
    },
    {
      detail: {
        summary: "WhatsApp Webhook (Evolution API)",
        tags: ["Webhooks"],
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
        const isValid = verifyTelegramSecret({ expectedSecret, receivedSecret });
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
        tags: ["Webhooks"],
      },
    },
  );

export async function registerEvolutionWebhook(): Promise<void> {
  const baseUrl = Env.EVOLUTION_API_URL;
  const token = Env.EVOLUTION_API_TOKEN;
  const instance = Env.EVOLUTION_API_INSTANCE;
  const apiUrl = Env.NEXT_PUBLIC_API_URL;

  if (!baseUrl || !token || !instance || !apiUrl) return;

  const webhookUrl = `${apiUrl}/integrations/whatsapp/webhook`;

  try {
    const res = await fetch(`${baseUrl}/webhook/set/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: token,
      },
      body: JSON.stringify({
        url: webhookUrl,
        events: ["MESSAGES_UPSERT"],
        enabled: true,
      }),
    });

    if (res.ok) {
      logger.info("Evolution API webhook registered", { webhookUrl });
    } else {
      logger.warn("Evolution API webhook registration failed", {
        status: res.status,
        body: await res.text(),
      });
    }
  } catch (err) {
    logger.warn("Evolution API webhook registration error", { err });
  }
}
