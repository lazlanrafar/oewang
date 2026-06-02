# Testing Implementation Examples

> **Practical code examples** to copy-paste and get started immediately.

## Table of Contents
1. [API Test Client](#api-test-client)
2. [Database Factories](#database-factories)
3. [Page Object Models](#page-object-models)
4. [Complete Test Examples](#complete-test-examples)

---

## API Test Client

### `apps/api/test/helpers/test-client.ts`

```typescript
import { Elysia } from 'elysia';

export interface RequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

export class TestClient {
  private baseURL = 'http://localhost:3002';
  private defaultHeaders: Record<string, string> = {};

  constructor(private app?: Elysia) {}

  /**
   * Set authorization token for subsequent requests
   */
  withAuth(token: string): TestClient {
    this.defaultHeaders['Authorization'] = `Bearer ${token}`;
    return this;
  }

  /**
   * GET request
   */
  async get(path: string, options: RequestOptions = {}) {
    const url = this.buildURL(path, options.query);
    const headers = { ...this.defaultHeaders, ...options.headers };

    if (this.app) {
      return this.app.handle(new Request(url, {
        method: 'GET',
        headers,
      }));
    }

    return fetch(url, { method: 'GET', headers });
  }

  /**
   * POST request
   */
  async post(path: string, body?: any, options: RequestOptions = {}) {
    const url = this.buildURL(path, options.query);
    const headers = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...options.headers,
    };

    if (this.app) {
      return this.app.handle(new Request(url, {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }));
    }

    return fetch(url, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PATCH request
   */
  async patch(path: string, body?: any, options: RequestOptions = {}) {
    const url = this.buildURL(path, options.query);
    const headers = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...options.headers,
    };

    if (this.app) {
      return this.app.handle(new Request(url, {
        method: 'PATCH',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }));
    }

    return fetch(url, {
      method: 'PATCH',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete(path: string, options: RequestOptions = {}) {
    const url = this.buildURL(path, options.query);
    const headers = { ...this.defaultHeaders, ...options.headers };

    if (this.app) {
      return this.app.handle(new Request(url, {
        method: 'DELETE',
        headers,
      }));
    }

    return fetch(url, { method: 'DELETE', headers });
  }

  /**
   * Helper to build URL with query parameters
   */
  private buildURL(path: string, query?: Record<string, string>): string {
    const url = new URL(path, this.baseURL);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    return url.toString();
  }

  /**
   * Extract JSON from response
   */
  static async json(response: Response) {
    return response.json();
  }

  /**
   * Assert response is successful
   */
  static expectSuccess(response: Response) {
    if (!response.ok) {
      throw new Error(
        `Expected successful response, got ${response.status}: ${response.statusText}`
      );
    }
    return response;
  }

  /**
   * Assert response has specific status
   */
  static expectStatus(response: Response, status: number) {
    if (response.status !== status) {
      throw new Error(
        `Expected status ${status}, got ${response.status}: ${response.statusText}`
      );
    }
    return response;
  }
}

/**
 * Create authenticated test client
 */
export async function createAuthenticatedClient(
  email: string,
  password: string
): Promise<TestClient> {
  const client = new TestClient();
  
  const response = await client.post('/auth/login', {
    email,
    password,
  });

  const data = await response.json();
  const token = data.access_token;

  return client.withAuth(token);
}
```

### `apps/api/test/helpers/index.ts`

```typescript
export { TestClient, createAuthenticatedClient } from './test-client';
export { db, resetDatabase, withTransaction } from './database';
export * from './assertions';
```

### `apps/api/test/helpers/assertions.ts`

```typescript
import { expect } from 'bun:test';

/**
 * Assert response matches expected shape
 */
export async function expectJSON(response: Response, expected: any) {
  const data = await response.json();
  expect(data).toMatchObject(expected);
  return data;
}

/**
 * Assert response has validation errors
 */
export async function expectValidationError(
  response: Response,
  field?: string
) {
  expect(response.status).toBe(400);
  const data = await response.json();
  expect(data.errors).toBeDefined();
  
  if (field) {
    expect(data.errors).toHaveProperty(field);
  }
  
  return data;
}

/**
 * Assert response is unauthorized
 */
export async function expectUnauthorized(response: Response) {
  expect(response.status).toBe(401);
  return response;
}

/**
 * Assert response is forbidden
 */
export async function expectForbidden(response: Response) {
  expect(response.status).toBe(403);
  return response;
}

/**
 * Assert response is not found
 */
export async function expectNotFound(response: Response) {
  expect(response.status).toBe(404);
  return response;
}
```

---

## Database Factories

### `packages/database/test/factories/base-factory.ts`

```typescript
import { cuid } from '@paralleldrive/cuid2';
import { faker } from '@faker-js/faker';
import type { DB } from '../..';

export abstract class BaseFactory<T> {
  constructor(protected db: DB) {}

  /**
   * Generate default attributes
   */
  protected abstract defaultAttributes(): Partial<T>;

  /**
   * Create entity in database
   */
  async create(overrides: Partial<T> = {}): Promise<T> {
    const attributes = {
      ...this.defaultAttributes(),
      ...overrides,
    };

    return this.insert(attributes);
  }

  /**
   * Create multiple entities
   */
  async createMany(count: number, overrides: Partial<T> = {}): Promise<T[]> {
    const promises = Array.from({ length: count }, () =>
      this.create(overrides)
    );
    return Promise.all(promises);
  }

  /**
   * Generate attributes without saving
   */
  build(overrides: Partial<T> = {}): Partial<T> {
    return {
      ...this.defaultAttributes(),
      ...overrides,
    };
  }

  /**
   * Insert into database (override in subclass)
   */
  protected abstract insert(attributes: Partial<T>): Promise<T>;

  /**
   * Generate unique email
   */
  protected uniqueEmail(): string {
    return `${faker.internet.userName()}-${cuid()}@example.com`;
  }

  /**
   * Generate CUID
   */
  protected generateId(): string {
    return cuid();
  }
}
```

### `packages/database/test/factories/user.factory.ts`

```typescript
import { faker } from '@faker-js/faker';
import { users } from '../../schema/users';
import { BaseFactory } from './base-factory';
import type { User } from '../../types';

export class UserFactory extends BaseFactory<User> {
  protected defaultAttributes(): Partial<User> {
    return {
      id: this.generateId(),
      email: this.uniqueEmail(),
      full_name: faker.person.fullName(),
      avatar_url: faker.image.avatar(),
      locale: 'en',
      timezone: 'UTC',
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  protected async insert(attributes: Partial<User>): Promise<User> {
    const [user] = await this.db
      .insert(users)
      .values(attributes as any)
      .returning();
    return user;
  }

  /**
   * Create user with workspace
   */
  async withWorkspace(workspaceName?: string): Promise<User> {
    const user = await this.create();
    
    // Create workspace for user
    await this.db.insert(workspaces).values({
      id: this.generateId(),
      user_id: user.id,
      name: workspaceName || `${user.full_name}'s Workspace`,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return user;
  }
}
```

### `packages/database/test/factories/transaction.factory.ts`

```typescript
import { faker } from '@faker-js/faker';
import { transactions } from '../../schema/transactions';
import { BaseFactory } from './base-factory';
import type { Transaction } from '../../types';

export class TransactionFactory extends BaseFactory<Transaction> {
  constructor(
    db: DB,
    private userId: string,
    private accountId: string
  ) {
    super(db);
  }

  protected defaultAttributes(): Partial<Transaction> {
    return {
      id: this.generateId(),
      user_id: this.userId,
      account_id: this.accountId,
      amount: parseFloat(faker.finance.amount()),
      description: faker.commerce.productName(),
      date: faker.date.recent(),
      type: faker.helpers.arrayElement(['income', 'expense']),
      status: 'completed',
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  protected async insert(attributes: Partial<Transaction>): Promise<Transaction> {
    const [transaction] = await this.db
      .insert(transactions)
      .values(attributes as any)
      .returning();
    return transaction;
  }

  /**
   * Create expense transaction
   */
  async expense(amount?: number): Promise<Transaction> {
    return this.create({
      type: 'expense',
      amount: amount || parseFloat(faker.finance.amount({ min: 10, max: 1000 })),
    });
  }

  /**
   * Create income transaction
   */
  async income(amount?: number): Promise<Transaction> {
    return this.create({
      type: 'income',
      amount: amount || parseFloat(faker.finance.amount({ min: 100, max: 5000 })),
    });
  }
}
```

### `packages/database/test/factories/index.ts`

```typescript
import type { DB } from '../..';
import { UserFactory } from './user.factory';
import { TransactionFactory } from './transaction.factory';
import { AccountFactory } from './account.factory';

export class TestFactories {
  public users: UserFactory;

  constructor(private db: DB) {
    this.users = new UserFactory(db);
  }

  transactions(userId: string, accountId: string) {
    return new TransactionFactory(this.db, userId, accountId);
  }

  accounts(userId: string) {
    return new AccountFactory(this.db, userId);
  }
}

export function createFactories(db: DB): TestFactories {
  return new TestFactories(db);
}
```

---

## Page Object Models

### `packages/playwright/page-objects/base-page.ts`

```typescript
import { Page, expect } from '@playwright/test';

export class BasePage {
  constructor(protected page: Page) {}

  /**
   * Navigate to a path
   */
  async goto(path: string) {
    await this.page.goto(path);
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Wait for element to be visible
   */
  async waitForElement(selector: string, options?: { timeout?: number }) {
    await this.page.waitForSelector(selector, {
      state: 'visible',
      ...options,
    });
  }

  /**
   * Click button by text
   */
  async clickButton(text: string) {
    await this.page.getByRole('button', { name: text }).click();
  }

  /**
   * Click button by test ID
   */
  async clickByTestId(testId: string) {
    await this.page.getByTestId(testId).click();
  }

  /**
   * Fill input by label
   */
  async fillInput(label: string, value: string) {
    await this.page.getByLabel(label).fill(value);
  }

  /**
   * Get text content
   */
  async getText(selector: string): Promise<string> {
    return (await this.page.textContent(selector)) || '';
  }

  /**
   * Wait for URL to match pattern
   */
  async waitForURL(pattern: string | RegExp) {
    await this.page.waitForURL(pattern);
  }

  /**
   * Wait for toast/notification message
   */
  async waitForToast(message?: string) {
    const toastSelector = '[data-sonner-toast]';
    await this.waitForElement(toastSelector);
    
    if (message) {
      await expect(this.page.getByText(message)).toBeVisible();
    }
  }

  /**
   * Take screenshot
   */
  async screenshot(name: string) {
    await this.page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  }
}
```

### `packages/playwright/page-objects/auth-page.ts`

```typescript
import { Page, expect } from '@playwright/test';
import { BasePage } from './base-page';

export class AuthPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to login page
   */
  async gotoLogin() {
    await this.goto('/en/login');
  }

  /**
   * Navigate to register page
   */
  async gotoRegister() {
    await this.goto('/en/register');
  }

  /**
   * Expand email/password form
   */
  async expandEmailForm() {
    await this.page.getByText('Show other options').click();
    await this.waitForElement('input[type="email"]');
  }

  /**
   * Fill login form
   */
  async fillLoginForm(email: string, password: string) {
    await this.expandEmailForm();
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password', { exact: true }).fill(password);
  }

  /**
   * Submit login form
   */
  async submitLogin() {
    await this.clickButton('Login');
  }

  /**
   * Complete login flow
   */
  async login(email: string, password: string) {
    await this.gotoLogin();
    await this.fillLoginForm(email, password);
    await this.submitLogin();
    await this.waitForURL('**/overview');
  }

  /**
   * Fill register form
   */
  async fillRegisterForm(
    email: string,
    password: string,
    confirmPassword?: string
  ) {
    await this.expandEmailForm();
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password', { exact: true }).fill(password);
    await this.page
      .getByLabel('Confirm Password')
      .fill(confirmPassword || password);
  }

  /**
   * Submit register form
   */
  async submitRegister() {
    await this.clickButton('Register');
  }

  /**
   * Complete registration flow
   */
  async register(email: string, password: string) {
    await this.gotoRegister();
    await this.fillRegisterForm(email, password);
    await this.submitRegister();
  }

  /**
   * Check for validation error
   */
  async expectValidationError(message: string) {
    await expect(this.page.getByText(message)).toBeVisible();
  }
}
```

### `packages/playwright/page-objects/transaction-page.ts`

```typescript
import { Page, expect, Locator } from '@playwright/test';
import { BasePage } from './base-page';

export class TransactionPage extends BasePage {
  // Locators
  private createButton: Locator;
  private amountInput: Locator;
  private descriptionInput: Locator;
  private categorySelect: Locator;
  private submitButton: Locator;

  constructor(page: Page) {
    super(page);
    this.createButton = page.getByTestId('create-transaction-btn');
    this.amountInput = page.getByLabel('Amount');
    this.descriptionInput = page.getByLabel('Description');
    this.categorySelect = page.getByLabel('Category');
    this.submitButton = page.getByRole('button', { name: 'Create' });
  }

  /**
   * Navigate to transactions page
   */
  async goto() {
    await super.goto('/en/transactions');
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
    description: string;
    category?: string;
  }) {
    await this.amountInput.fill(data.amount);
    await this.descriptionInput.fill(data.description);
    
    if (data.category) {
      await this.categorySelect.click();
      await this.page.getByText(data.category).click();
    }
  }

  /**
   * Submit form
   */
  async submit() {
    await this.submitButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Create transaction (full flow)
   */
  async createTransaction(data: {
    amount: string;
    description: string;
    category?: string;
  }) {
    await this.clickCreate();
    await this.fillForm(data);
    await this.submit();
    await this.waitForToast('Transaction created');
  }

  /**
   * Search for transaction
   */
  async search(query: string) {
    const searchInput = this.page.getByPlaceholder('Search transactions');
    await searchInput.fill(query);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Filter by category
   */
  async filterByCategory(category: string) {
    await this.page.getByRole('button', { name: 'Filter' }).click();
    await this.page.getByLabel('Category').click();
    await this.page.getByText(category).click();
    await this.clickButton('Apply');
  }

  /**
   * Get transaction row by description
   */
  getTransactionRow(description: string): Locator {
    return this.page.getByRole('row').filter({ hasText: description });
  }

  /**
   * Delete transaction
   */
  async deleteTransaction(description: string) {
    const row = this.getTransactionRow(description);
    await row.getByRole('button', { name: 'Delete' }).click();
    await this.clickButton('Confirm');
    await this.waitForToast('Transaction deleted');
  }

  /**
   * Expect transaction to be visible
   */
  async expectTransactionVisible(description: string) {
    await expect(this.getTransactionRow(description)).toBeVisible();
  }
}
```

---

## Complete Test Examples

### Example 1: API Integration Test

```typescript
// apps/api/test/integration/transactions.test.ts
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { db } from '@workspace/database';
import { TestClient } from '../helpers';
import { createFactories } from '@workspace/database/test/factories';

describe('POST /transactions', () => {
  let client: TestClient;
  let factories: ReturnType<typeof createFactories>;
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    factories = createFactories(db);
    
    // Create test user
    const user = await factories.users.withWorkspace();
    userId = user.id;

    // Create test account
    const account = await factories.accounts(userId).create();
    accountId = account.id;

    // Create authenticated client
    client = new TestClient().withAuth('test-token'); // Replace with real auth
  });

  afterEach(async () => {
    // Cleanup
    await db.delete(transactions).where(eq(transactions.user_id, userId));
    await db.delete(accounts).where(eq(accounts.id, accountId));
    await db.delete(users).where(eq(users.id, userId));
  });

  test('creates a transaction successfully', async () => {
    const payload = {
      account_id: accountId,
      amount: 100.50,
      description: 'Test transaction',
      type: 'expense',
      date: new Date().toISOString(),
    };

    const response = await client.post('/transactions', payload);
    
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data).toMatchObject({
      amount: 100.50,
      description: 'Test transaction',
      type: 'expense',
    });
    expect(data.id).toBeDefined();
  });

  test('validates required fields', async () => {
    const response = await client.post('/transactions', {});
    
    expect(response.status).toBe(400);

    const error = await response.json();
    expect(error.errors).toContain('amount is required');
    expect(error.errors).toContain('account_id is required');
  });

  test('prevents negative amounts', async () => {
    const payload = {
      account_id: accountId,
      amount: -50,
      description: 'Invalid transaction',
      type: 'expense',
    };

    const response = await client.post('/transactions', payload);
    
    expect(response.status).toBe(400);
  });

  test('updates account balance correctly', async () => {
    // Get initial balance
    const accountBefore = await db.query.accounts.findFirst({
      where: eq(accounts.id, accountId),
    });
    const initialBalance = accountBefore?.balance || 0;

    // Create expense transaction
    await client.post('/transactions', {
      account_id: accountId,
      amount: 100,
      description: 'Test expense',
      type: 'expense',
    });

    // Check balance updated
    const accountAfter = await db.query.accounts.findFirst({
      where: eq(accounts.id, accountId),
    });

    expect(accountAfter?.balance).toBe(initialBalance - 100);
  });
});
```

### Example 2: E2E Test with Page Objects

```typescript
// apps/app/e2e/transaction-management.spec.ts
import { test, expect } from './fixtures';
import { AuthPage, DashboardPage, TransactionPage } from '@workspace/playwright/page-objects';

test.describe('Transaction Management', () => {
  let authPage: AuthPage;
  let dashboard: DashboardPage;
  let transactionPage: TransactionPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    dashboard = new DashboardPage(page);
    transactionPage = new TransactionPage(page);

    // Login is handled by auth.setup.ts, so we just navigate
    await dashboard.goto();
  });

  test('user can create an expense transaction', async ({ page }) => {
    // Navigate to transactions
    await transactionPage.goto();

    // Create transaction
    await transactionPage.createTransaction({
      amount: '150.00',
      description: 'Office supplies',
      category: 'Business Expenses',
    });

    // Verify transaction appears in list
    await transactionPage.expectTransactionVisible('Office supplies');
    
    // Verify amount is displayed
    await expect(page.getByText('-$150.00')).toBeVisible();
  });

  test('user can search for transactions', async ({ page }) => {
    // Create some test transactions first
    await transactionPage.goto();
    await transactionPage.createTransaction({
      amount: '50.00',
      description: 'Coffee',
    });
    await transactionPage.createTransaction({
      amount: '200.00',
      description: 'Laptop',
    });

    // Search for specific transaction
    await transactionPage.search('Coffee');

    // Should show Coffee, not Laptop
    await expect(page.getByText('Coffee')).toBeVisible();
    await expect(page.getByText('Laptop')).not.toBeVisible();
  });

  test('user can delete a transaction', async ({ page }) => {
    // Create transaction
    await transactionPage.goto();
    await transactionPage.createTransaction({
      amount: '75.00',
      description: 'Test Delete',
    });

    // Delete it
    await transactionPage.deleteTransaction('Test Delete');

    // Verify it's gone
    await expect(page.getByText('Test Delete')).not.toBeVisible();
  });

  test('user cannot create transaction with negative amount', async ({ page }) => {
    await transactionPage.goto();
    await transactionPage.clickCreate();
    
    await transactionPage.fillForm({
      amount: '-50.00',
      description: 'Invalid transaction',
    });
    
    await transactionPage.submit();

    // Should show validation error
    await expect(page.getByText('Amount must be positive')).toBeVisible();
  });
});
```

### Example 3: Visual Regression Test

```typescript
// apps/app/e2e/visual/dashboard.visual.spec.ts
import { test, expect } from '../fixtures';
import { DashboardPage } from '@workspace/playwright/page-objects';

test.describe('Dashboard Visual Regression', () => {
  test('dashboard matches baseline (light theme)', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await page.waitForLoadState('networkidle');

    // Hide dynamic content (dates, real-time updates)
    await page.evaluate(() => {
      document.querySelectorAll('[data-dynamic="true"]').forEach((el) => {
        if (el instanceof HTMLElement) {
          el.textContent = 'SNAPSHOT_PLACEHOLDER';
        }
      });
    });

    await expect(page).toHaveScreenshot('dashboard-light.png', {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    });
  });

  test('dashboard matches baseline (dark theme)', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Switch to dark theme
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });

    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('dashboard-dark.png', {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    });
  });

  test('responsive layout - mobile view', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('dashboard-mobile.png', {
      maxDiffPixelRatio: 0.01,
    });
  });
});
```

### Example 4: Accessibility Test

```typescript
// apps/app/e2e/a11y/dashboard.a11y.spec.ts
import { test } from '../fixtures';
import { injectAxe, checkA11y, configureAxe } from 'axe-playwright';

test.describe('Dashboard Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/overview');
    await injectAxe(page);
  });

  test('dashboard has no accessibility violations', async ({ page }) => {
    await configureAxe(page, {
      rules: [
        { id: 'color-contrast', enabled: true },
        { id: 'heading-order', enabled: true },
        { id: 'label', enabled: true },
      ],
    });

    await checkA11y(page, null, {
      detailedReport: true,
      detailedReportOptions: { html: true },
    });
  });

  test('navigation is keyboard accessible', async ({ page }) => {
    // Tab through navigation
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Should be able to activate link with Enter
    await page.keyboard.press('Enter');
    
    // URL should have changed
    await page.waitForURL(/\/transactions/);
  });

  test('forms are screen reader friendly', async ({ page }) => {
    await page.goto('/en/transactions');
    await page.getByTestId('create-transaction-btn').click();

    // All form inputs should have accessible labels
    await checkA11y(page, '[role="dialog"]', {
      rules: {
        label: { enabled: true },
        'aria-required-attr': { enabled: true },
      },
    });
  });
});
```

---

## Usage Instructions

### 1. Copy Files to Your Project

```bash
# API test helpers
mkdir -p apps/api/test/helpers
# Copy test-client.ts, assertions.ts, index.ts

# Database factories
mkdir -p packages/database/test/factories
# Copy base-factory.ts, user.factory.ts, transaction.factory.ts, index.ts

# Page Object Models
mkdir -p packages/playwright/page-objects
# Copy base-page.ts, auth-page.ts, transaction-page.ts

# Test examples
mkdir -p apps/api/test/integration
mkdir -p apps/app/e2e/visual
mkdir -p apps/app/e2e/a11y
# Copy relevant test files
```

### 2. Install Dependencies

```bash
bun add -D @faker-js/faker axe-playwright
```

### 3. Run Tests

```bash
# API tests
bun test apps/api/test/integration/transactions.test.ts

# E2E tests
cd apps/app && bun run test:e2e

# Visual tests
cd apps/app && bunx playwright test e2e/visual

# Accessibility tests
cd apps/app && bunx playwright test e2e/a11y
```

---

**Next:** Start with the API Test Client and create your first integration test! 🚀
