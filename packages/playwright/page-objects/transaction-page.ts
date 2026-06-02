import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * Page Object for transactions page
 */
export class TransactionPage extends BasePage {
  // Common locators
  private createButton: Locator;
  private searchInput: Locator;

  constructor(page: Page) {
    super(page);
    this.createButton = page.getByTestId('create-transaction-btn').or(
      page.getByRole('button', { name: /create.*transaction/i })
    );
    this.searchInput = page.getByPlaceholder(/search.*transaction/i);
  }

  /**
   * Navigate to transactions page
   */
  async goto(locale = 'en') {
    await super.goto(`/${locale}/transactions`);
  }

  /**
   * Click create transaction button
   */
  async clickCreate() {
    await this.createButton.click();
    await this.waitForElement('[role="dialog"]'); // Wait for modal
  }

  /**
   * Fill transaction form
   */
  async fillForm(data: {
    amount: string;
    description?: string;
    name?: string;
    wallet?: string;
    category?: string;
    date?: string;
  }) {
    // Amount
    await this.page.getByLabel(/amount/i).fill(data.amount);

    // Description/Name
    if (data.description) {
      await this.page.getByLabel(/description/i).fill(data.description);
    }
    if (data.name) {
      await this.page.getByLabel(/name/i).fill(data.name);
    }

    // Wallet selection
    if (data.wallet) {
      await this.page.getByLabel(/wallet/i).click();
      await this.page.getByText(data.wallet).click();
    }

    // Category selection
    if (data.category) {
      await this.page.getByLabel(/category/i).click();
      await this.page.getByText(data.category).click();
    }

    // Date
    if (data.date) {
      await this.page.getByLabel(/date/i).fill(data.date);
    }
  }

  /**
   * Submit transaction form
   */
  async submit() {
    await this.clickButton(/submit|create|save/i);
    await this.waitForNetwork();
  }

  /**
   * Create transaction (full flow)
   */
  async createTransaction(data: {
    amount: string;
    description?: string;
    name?: string;
    wallet?: string;
    category?: string;
  }) {
    await this.clickCreate();
    await this.fillForm(data);
    await this.submit();
    await this.waitForToast(/created|success/i, { timeout: 5000 });
  }

  /**
   * Search for transactions
   */
  async search(query: string) {
    if (await this.searchInput.isVisible()) {
      await this.searchInput.fill(query);
      await this.waitForNetwork();
    }
  }

  /**
   * Filter by category
   */
  async filterByCategory(category: string) {
    await this.clickButton(/filter/i);
    await this.page.getByLabel(/category/i).click();
    await this.page.getByText(category).click();
    await this.clickButton(/apply/i);
    await this.waitForNetwork();
  }

  /**
   * Filter by wallet
   */
  async filterByWallet(wallet: string) {
    await this.clickButton(/filter/i);
    await this.page.getByLabel(/wallet/i).click();
    await this.page.getByText(wallet).click();
    await this.clickButton(/apply/i);
    await this.waitForNetwork();
  }

  /**
   * Get transaction row by description or name
   */
  getTransactionRow(text: string): Locator {
    return this.page.getByRole('row').filter({ hasText: text });
  }

  /**
   * Click edit on a transaction
   */
  async editTransaction(text: string) {
    const row = this.getTransactionRow(text);
    await row.getByRole('button', { name: /edit/i }).click();
    await this.waitForElement('[role="dialog"]');
  }

  /**
   * Delete transaction
   */
  async deleteTransaction(text: string) {
    const row = this.getTransactionRow(text);
    await row.getByRole('button', { name: /delete/i }).click();
    await this.clickButton(/confirm|delete/i);
    await this.waitForToast(/deleted/i);
  }

  /**
   * Expect transaction to be visible
   */
  async expectTransactionVisible(text: string) {
    await expect(this.getTransactionRow(text)).toBeVisible();
  }

  /**
   * Expect transaction not to be visible
   */
  async expectTransactionNotVisible(text: string) {
    await expect(this.getTransactionRow(text)).not.toBeVisible();
  }

  /**
   * Get transaction count
   */
  async getTransactionCount(): Promise<number> {
    const rows = this.page.getByRole('row');
    return (await rows.count()) - 1; // Subtract header row
  }

  /**
   * Bulk select transactions
   */
  async selectTransactions(texts: string[]) {
    for (const text of texts) {
      const row = this.getTransactionRow(text);
      await row.getByRole('checkbox').check();
    }
  }

  /**
   * Bulk delete selected transactions
   */
  async bulkDelete() {
    await this.clickButton(/delete.*selected/i);
    await this.clickButton(/confirm/i);
    await this.waitForToast(/deleted/i);
  }
}
