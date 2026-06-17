import { Env } from "@workspace/constants";
import { logger } from "@workspace/logger";
import { Elysia } from "elysia";
import { IntegrationsService } from "./integrations.service";
import {
  verifyEvolutionApiKey,
  verifyTelegramSecret,
} from "./webhook-security";

export const publicWebhooksController = new Elysia({ prefix: "/integrations" })
  .post(
    "/whatsapp/webhook",
    async ({ request, set, body }) => {
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

      // Authenticate the webhook. This endpoint is unencrypted and not
      // rate-limited, so an unverified payload could drive bot/AI actions for
      // any user. Evolution sends the instance apikey in the body (and can be
      // configured to send an `apikey`/Bearer header); verify it matches.
      const expectedToken = Env.EVOLUTION_API_TOKEN;
      if (process.env.NODE_ENV === "production" && !expectedToken) {
        set.status = 500;
        return "WhatsApp webhook is not configured";
      }
      if (expectedToken) {
        const headerToken =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          null;
        const receivedToken =
          headerToken ??
          (typeof parsedBody.apikey === "string" ? parsedBody.apikey : null);
        if (!verifyEvolutionApiKey({ expectedToken, receivedToken })) {
          set.status = 403;
          return "Forbidden";
        }
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

  const webhookUrl = `${apiUrl.replace(/\/$/, "")}/v1/integrations/whatsapp/webhook`;

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

export async function registerTelegramWebhook(): Promise<void> {
  const token = Env.TELEGRAM_BOT_TOKEN;
  const apiUrl = Env.NEXT_PUBLIC_API_URL;
  const secret = Env.TELEGRAM_WEBHOOK_SECRET;

  if (!token || !apiUrl) return;
  if (apiUrl.startsWith("http://localhost")) {
    logger.info(
      "Skipping Telegram webhook registration (NEXT_PUBLIC_API_URL is localhost — use scripts/setup-telegram.ts with a public tunnel URL instead)",
    );
    return;
  }

  const webhookUrl = `${apiUrl.replace(/\/$/, "")}/v1/integrations/telegram/webhook`;

  try {
    const params = new URLSearchParams({ url: webhookUrl });
    if (secret) params.set("secret_token", secret);

    const res = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook?${params.toString()}`,
    );
    const result = (await res.json()) as { ok?: boolean; description?: string };

    if (result.ok) {
      logger.info("Telegram webhook registered", {
        webhookUrl,
        hasSecret: Boolean(secret),
      });
    } else {
      logger.warn("Telegram webhook registration failed", {
        webhookUrl,
        description: result.description,
      });
    }
  } catch (err) {
    logger.warn("Telegram webhook registration error", { err });
  }
}
