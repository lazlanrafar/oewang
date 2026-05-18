import type { DB } from './base-factory';
import { UserFactory } from './user.factory';
import { WorkspaceFactory } from './workspace.factory';
import { WalletFactory } from './wallet.factory';
import { TransactionFactory } from './transaction.factory';

/**
 * Test factories container
 * Provides easy access to all entity factories
 */
export class TestFactories {
  public users: UserFactory;
  public workspaces: WorkspaceFactory;

  constructor(private db: DB) {
    this.users = new UserFactory(db);
    this.workspaces = new WorkspaceFactory(db);
  }

  /**
   * Get wallet factory for a specific workspace
   */
  wallets(workspaceId: string) {
    return new WalletFactory(this.db, workspaceId);
  }

  /**
   * Get transaction factory for a specific workspace and wallet
   */
  transactions(workspaceId: string, walletId: string) {
    return new TransactionFactory(this.db, workspaceId, walletId);
  }

  /**
   * Create a complete test setup with user, workspace, wallet, and transactions
   */
  async createFullSetup(transactionCount = 10) {
    // Create user with workspace
    const { user, workspace } = await this.users.withWorkspace();

    // Create wallet
    const wallet = await this.wallets(workspace.id).withBalance(1000);

    // Create transactions
    const transactionFactory = this.transactions(workspace.id, wallet.id);
    const txns = await transactionFactory.createMany(transactionCount);

    return {
      user,
      workspace,
      wallet,
      transactions: txns,
    };
  }
}

/**
 * Create factories instance
 */
export function createFactories(db: DB): TestFactories {
  return new TestFactories(db);
}

// Re-export factory classes
export { UserFactory } from './user.factory';
export { WorkspaceFactory } from './workspace.factory';
export { WalletFactory } from './wallet.factory';
export { TransactionFactory } from './transaction.factory';
export { BaseFactory } from './base-factory';
export type { DB } from './base-factory';
