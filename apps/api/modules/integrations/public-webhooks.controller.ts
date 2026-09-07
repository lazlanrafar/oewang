import { Env } from "@workspace/constants";
import { logger } from "@workspace/logger";
import { Elysia } from "elysia";
import { verifyTelegramSecret } from "./webhook-security";

// Enqueues onto the Go worker (apps/worker) instead of processing in-process —
// asynq gives retry/DLQ instead of this handler's old silent `.catch(logger.error)`
// drop. Telegram's own `update_id` is passed through so the worker can dedup
// (asynq TaskID/Unique) without a new Postgres table.
async function enqueueTelegramWebhook(
  parsedBody: Record<string, any>,
): Promise<void> {
  const workerUrl = Env.WORKER_URL;
  const workerApiKey = Env.WORKER_API_KEY;
  if (!workerUrl || !workerApiKey) {
    throw new Error(
      "Worker is not configured (WORKER_URL/WORKER_API_KEY missing)",
    );
  }

  const res = await fetch(
    `${workerUrl.replace(/\/$/, "")}/internal/enqueue/telegram-webhook`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": workerApiKey,
      },
      body: JSON.stringify({
        update_id: parsedBody.update_id,
        raw_body: parsedBody,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Worker enqueue failed: ${res.status}`);
  }
}

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

      enqueueTelegramWebhook(parsedBody).catch((error) =>
        logger.error("Telegram webhook enqueue error", { error }),
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
