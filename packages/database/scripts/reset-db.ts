import { db } from "../client";
import { sql } from "drizzle-orm";
import * as schema from "../index";

async function resetDb() {
  console.log("🚀 Starting database reset...");

  const tablesToClear = [
    "ai_messages",
    "ai_sessions",
    "articles",
    "audit_logs",
    "transaction_attachments",
    "transactions",
    "categories",
    "orders",
    "user_workspaces",
    "vault_files",
    "wallet_groups",
    "wallets",
    "workspace_integrations",
    "workspace_invitations",
    "workspace_settings",
    "workspace_sub_currencies",
    "users",
    "workspaces",
  ];

  try {
    for (const table of tablesToClear) {
      console.log(`🧹 Clearing table: ${table}...`);
      // We use CASCADE to handle foreign key dependencies automatically
      await db.execute(
        sql.raw(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`),
      );
    }

    console.log("✅ Database reset complete (pricing preserved).");
  } catch (error) {
    console.error("❌ Database reset failed:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

resetDb();
