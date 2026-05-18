import { db } from '@workspace/database';
import type { PgTransaction } from 'drizzle-orm/pg-core';

/**
 * Reset test database (truncate all tables)
 * WARNING: Only use in test environment!
 */
export async function resetDatabase() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetDatabase can only be called in test environment');
  }

  // Get all table names from the schema
  const tables = await db.execute`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
  `;

  // Truncate all tables (restart identity to reset sequences)
  for (const { tablename } of tables as any[]) {
    if (tablename !== '_drizzle_migrations') {
      await db.execute`TRUNCATE TABLE ${tablename} RESTART IDENTITY CASCADE`;
    }
  }
}

/**
 * Run a function within a database transaction and rollback after
 * Useful for isolating test data
 */
export async function withTransaction<T>(
  fn: (tx: PgTransaction<any, any, any>) => Promise<T>
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
    super('Rollback');
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
 * Clean up test data by user ID
 */
export async function cleanupUser(userId: string) {
  if (!userId) return;

  // Delete in order to respect foreign key constraints
  await db.execute`DELETE FROM transactions WHERE user_id = ${userId}`;
  await db.execute`DELETE FROM accounts WHERE user_id = ${userId}`;
  await db.execute`DELETE FROM budgets WHERE user_id = ${userId}`;
  await db.execute`DELETE FROM categories WHERE user_id = ${userId}`;
  await db.execute`DELETE FROM workspaces WHERE user_id = ${userId}`;
  await db.execute`DELETE FROM users WHERE id = ${userId}`;
}

/**
 * Export the database instance for direct use in tests
 */
export { db };
