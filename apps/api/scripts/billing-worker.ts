import { loadEnv } from "@workspace/utils/load-env";
loadEnv();

import { createLogger } from "@workspace/logger";
import { db } from "@workspace/database";
import { sql } from "drizzle-orm";
import { BillingLifecycleService } from "../modules/mayar/billing-lifecycle.service";

const logger = createLogger("billing-worker");

async function run() {
  logger.info("Starting billing lifecycle check...");

  try {
    await db.execute(sql`SELECT 1`);
    await BillingLifecycleService.processLifecycle();
    logger.info("Billing lifecycle check completed successfully.");
    process.exit(0);
  } catch (error) {
    logger.error("Error during billing lifecycle check", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

run();
