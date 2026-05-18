import { faker } from '@faker-js/faker';
import { transactions } from '../../schema/transactions';
import { BaseFactory, type DB } from './base-factory';

export interface TransactionAttributes {
  id?: string;
  workspaceId: string;
  walletId: string;
  toWalletId?: string;
  categoryId?: string;
  assignedUserId?: string;
  amount?: string;
  date?: string;
  type?: 'income' | 'expense' | 'transfer';
  description?: string;
  name?: string;
  isReady?: boolean;
  isExported?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Factory for creating test transactions
 */
export class TransactionFactory extends BaseFactory<TransactionAttributes> {
  constructor(
    db: DB,
    private workspaceId: string,
    private walletId: string
  ) {
    super(db);
  }

  protected defaultAttributes(): Partial<TransactionAttributes> {
    const type = faker.helpers.arrayElement(['income', 'expense', 'transfer']);
    return {
      id: this.generateId(),
      workspaceId: this.workspaceId,
      walletId: this.walletId,
      amount: faker.finance.amount({ min: 10, max: 1000 }),
      date: this.pastDate(30).toISOString(),
      type,
      description: faker.commerce.productDescription(),
      name: faker.commerce.productName(),
      isReady: true,
      isExported: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  protected async insert(attributes: Partial<TransactionAttributes>) {
    const [transaction] = await this.db
      .insert(transactions)
      .values(attributes as any)
      .returning();
    return transaction;
  }

  /**
   * Create expense transaction
   */
  async expense(amount?: number) {
    return this.create({
      type: 'expense',
      amount: amount?.toString() || faker.finance.amount({ min: 10, max: 1000 }),
      description: `Expense: ${faker.commerce.productName()}`,
    });
  }

  /**
   * Create income transaction
   */
  async income(amount?: number) {
    return this.create({
      type: 'income',
      amount: amount?.toString() || faker.finance.amount({ min: 100, max: 5000 }),
      description: `Income: ${faker.company.name()}`,
    });
  }

  /**
   * Create transfer transaction
   */
  async transfer(toWalletId: string, amount?: number) {
    return this.create({
      type: 'transfer',
      toWalletId,
      amount: amount?.toString() || faker.finance.amount({ min: 50, max: 2000 }),
      description: `Transfer to wallet`,
    });
  }

  /**
   * Create transaction with specific date
   */
  async onDate(date: Date) {
    return this.create({ date: date.toISOString() });
  }

  /**
   * Create multiple transactions for a date range
   */
  async forDateRange(startDate: Date, endDate: Date, count: number) {
    const transactions = [];
    for (let i = 0; i < count; i++) {
      const randomDate = new Date(
        startDate.getTime() +
          Math.random() * (endDate.getTime() - startDate.getTime())
      );
      transactions.push(await this.onDate(randomDate));
    }
    return transactions;
  }
}
