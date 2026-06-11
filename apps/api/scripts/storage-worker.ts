import { loadEnv } from "@workspace/utils/load-env";

loadEnv();

import { db } from "@workspace/database";
import { createLogger } from "@workspace/logger";
import { sql } from "drizzle-orm";
import { VaultService } from "../modules/vault/vault.service";

const logger = createLogger("storage-worker");

async function run() {
  logger.info("Starting storage violation check...");

  try {
    // Ensure DB connection
    await db.execute(sql`SELECT 1`);

    await VaultService.processStorageViolations();
    await VaultService.hardDeleteExtendedInactiveFiles();

    logger.info("Storage violation check completed successfully.");
    process.exit(0);
  } catch (error) {
    logger.error("Error during storage violation check", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

run();
