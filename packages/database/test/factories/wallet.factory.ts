import { faker } from "@faker-js/faker";
import { wallets } from "../../schema/wallets";
import { BaseFactory, type DB } from "./base-factory";

export interface WalletAttributes {
  id?: string;
  workspaceId: string;
  groupId?: string;
  name?: string;
  balance?: string;
  isIncludedInTotals?: boolean;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Factory for creating test wallets
 */
export class WalletFactory extends BaseFactory<WalletAttributes> {
  constructor(
    db: DB,
    private workspaceId: string,
  ) {
    super(db);
  }

  protected defaultAttributes(): Partial<WalletAttributes> {
    return {
      id: this.generateId(),
      workspaceId: this.workspaceId,
      name: `${faker.finance.accountName()} ${faker.string.numeric(4)}`,
      balance: "0",
      isIncludedInTotals: true,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  protected async insert(
    attributes: Partial<WalletAttributes>,
  ): Promise<WalletAttributes> {
    const [wallet] = await this.db
      .insert(wallets)
      .values(attributes as any)
      .returning();
    return wallet! as WalletAttributes;
  }

  /**
   * Create wallet with initial balance
   */
  async withBalance(balance: number) {
    return this.create({ balance: balance.toString() });
  }

  /**
   * Create checking account
   */
  async checking() {
    return this.create({
      name: `Checking Account ${faker.string.numeric(4)}`,
      balance: faker.finance.amount({ min: 1000, max: 10000 }),
    });
  }

  /**
   * Create savings account
   */
  async savings() {
    return this.create({
      name: `Savings Account ${faker.string.numeric(4)}`,
      balance: faker.finance.amount({ min: 5000, max: 50000 }),
    });
  }

  /**
   * Create credit card
   */
  async creditCard() {
    return this.create({
      name: `Credit Card ${faker.string.numeric(4)}`,
      balance: faker.finance.amount({ min: -5000, max: 0 }),
    });
  }
}
