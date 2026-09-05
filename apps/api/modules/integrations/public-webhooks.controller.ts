import { Env } from "@workspace/constants";
import { logger } from "@workspace/logger";
import { Elysia } from "elysia";
import { IntegrationsService } from "./integrations.service";
import { verifyTelegramSecret } from "./webhook-security";

export const publicWebhooksController = new Elysia({ prefix: "/integrations" })
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
