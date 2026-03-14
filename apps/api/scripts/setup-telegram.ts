
import { Env } from "@workspace/constants";

async function setup() {
  const token = process.env.TELEGRAM_BOT_TOKEN || Env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = process.argv[2];

  if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN is missing in .env");
    process.exit(1);
  }

  if (!webhookUrl) {
    console.error("❌ Please provide a public HTTPS URL as an argument.");
    console.log("Usage: bun run scripts/setup-telegram.ts https://your-public-url.ngrok-free.app");
    process.exit(1);
  }

  const fullWebhookUrl = `${webhookUrl.replace(/\/$/, "")}/v1/integrations/telegram/webhook`;

  console.log(`📡 Setting Telegram Webhook to: ${fullWebhookUrl}`);

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${fullWebhookUrl}`);
  const result = await response.json();

  if (result.ok) {
    console.log("✅ Webhook set successfully!");
    console.log(result);
  } else {
    console.error("❌ Failed to set webhook:");
    console.error(result);
    process.exit(1);
  }
}

setup().catch(console.error);
