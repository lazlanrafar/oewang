import { sql } from "drizzle-orm";
import { db } from "@workspace/database";
import type { PgTransaction } from "drizzle-orm/pg-core";

/**
 * Reset test database (truncate all tables)
 * WARNING: Only use in test environment!
 */
export async function resetDatabase() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("resetDatabase can only be called in test environment");
  }

  const tables = await db.execute(sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
  `);

  for (const { tablename } of tables as any[]) {
    if (tablename !== "_drizzle_migrations") {
      await db.execute(sql.raw(`TRUNCATE TABLE "${tablename}" RESTART IDENTITY CASCADE`));
    }
  }
}

/**
 * Run a function within a database transaction and rollback after
 * Useful for isolating test data
 */
export async function withTransaction<T>(
  fn: (tx: PgTransaction<any, any, any>) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    try {
      const result = await fn(tx);
      // Force rollback by throwing
      throw new RollbackError(result);
    } catch (error) {
      if (error instanceof RollbackError) {
        return error.result;
      }
      throw error;
    }
  });
}

/**
 * Internal error class to force transaction rollback
 */
class RollbackError extends Error {
  constructor(public result: any) {
    super("Rollback");
  }
}

/**
 * Seed basic test data (users, workspaces, etc.)
 * Returns created entities for use in tests
 */
export async function seedTestData() {
  // This is a placeholder - will be implemented with factories
  return {
    users: [],
    workspaces: [],
    accounts: [],
  };
}

/**
 * Clean up test data by user ID.
 * Handles FK constraints: clears workspace link from user before deleting workspace,
 * which cascades to wallets, transactions, and other workspace-owned data.
 */
export async function cleanupUser(userId: string) {
  if (!userId) return;

  // Get workspace ID before we unlink it
  const rows = await db.execute(sql`SELECT workspace_id FROM users WHERE id = ${userId}`);
  const workspaceId = (rows as unknown as Array<{ workspace_id: string | null }>)[0]?.workspace_id;

  // Clear workspace_id FK first so we can delete the workspace
  await db.execute(sql`UPDATE users SET workspace_id = NULL WHERE id = ${userId}`);

  // Delete workspace — cascades to wallets, wallet_groups, transactions, etc.
  if (workspaceId) {
    await db.execute(sql`DELETE FROM workspaces WHERE id = ${workspaceId}`);
  }

  // Delete user
  await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
}

/**
 * Export the database instance for direct use in tests
 */
export { db };
