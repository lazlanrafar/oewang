import { Client, LocalAuth } from "whatsapp-web.js";
import { createLogger } from "@workspace/logger";

const log = createLogger("test-wa");

async function test() {
  log.info("Starting WhatsApp Web test...");
  try {
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: "test-bot", dataPath: "./.test_wwebjs_auth" }),
      puppeteer: {
        headless: true,
        args: ["--no-sandbox"],
      }
    });

    client.on("qr", (qr) => {
      log.info("QR received!", { qr });
      process.exit(0);
    });

    client.on("ready", () => {
      log.info("Client is ready!");
      process.exit(0);
    });

    log.info("Initializing...");
    await client.initialize();
    log.info("Initialized!");
  } catch (err) {
    log.error("Failed to initialize", { err });
    process.exit(1);
  }
}

test();
