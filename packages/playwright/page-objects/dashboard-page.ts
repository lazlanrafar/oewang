import { type Page, expect } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * Page Object for the main dashboard/overview page
 */
export class DashboardPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to dashboard
   */
  async goto(locale = 'en') {
    await super.goto(`/${locale}/overview`);
  }

  /**
   * Navigate using sidebar
   */
  async navigateTo(section: 'overview' | 'transactions' | 'accounts' | 'budgets' | 'settings') {
    const link = this.page.getByRole('link', { name: new RegExp(section, 'i') });
    await link.click();
    await this.waitForNetwork();
  }

  /**
   * Get total balance
   */
  async getTotalBalance(): Promise<string> {
    return this.getText('[data-testid="total-balance"]');
  }

  /**
   * Get income this month
   */
  async getIncomeThisMonth(): Promise<string> {
    return this.getText('[data-testid="income-month"]');
  }

  /**
   * Get expenses this month
   */
  async getExpensesThisMonth(): Promise<string> {
    return this.getText('[data-testid="expenses-month"]');
  }

  /**
   * Check if chart is visible
   */
  async expectChartVisible() {
    await this.expectVisible('[data-testid="dashboard-chart"]');
  }

  /**
   * Check if recent transactions are visible
   */
  async expectRecentTransactionsVisible() {
    await this.expectVisible('[data-testid="recent-transactions"]');
  }

  /**
   * Click workspace switcher
   */
  async clickWorkspaceSwitcher() {
    await this.clickByTestId('workspace-switcher');
  }

  /**
   * Switch workspace
   */
  async switchWorkspace(workspaceName: string) {
    await this.clickWorkspaceSwitcher();
    await this.page.getByText(workspaceName).click();
    await this.waitForNetwork();
  }

  /**
   * Open user menu
   */
  async openUserMenu() {
    await this.clickByTestId('user-menu-trigger');
  }

  /**
   * Navigate to settings from user menu
   */
  async gotoSettings() {
    await this.openUserMenu();
    await this.clickButton('Settings');
    await this.waitForURL(/.*settings/);
  }
}
