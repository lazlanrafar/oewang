# End-to-End Testing Implementation Roadmap

> **Last Updated:** 2026-05-18  
> **Status:** Implementation Guide  
> **Priority:** High

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Testing Architecture](#testing-architecture)
4. [Implementation Roadmap](#implementation-roadmap)
5. [Testing Layers](#testing-layers)
6. [Infrastructure & Tools](#infrastructure--tools)
7. [CI/CD Integration](#cicd-integration)
8. [Best Practices](#best-practices)
9. [Appendix](#appendix)

---

## Executive Summary

### What We're Building

A comprehensive, multi-layer testing strategy for the oewang monorepo that covers:
- **Frontend E2E Testing** (Playwright) - ✅ Partially complete
- **API Integration Testing** (Bun Test + Supertest-like approach)
- **Mobile E2E Testing** (Flutter Integration Tests)
- **Cross-service Integration Testing**
- **Performance & Load Testing**
- **Visual Regression Testing**
- **Accessibility Testing**

### Success Metrics

- **Code Coverage:** ≥80% for critical paths
- **Test Execution Time:** <10 minutes for full suite
- **Flakiness Rate:** <2% test failure rate
- **Developer Experience:** Tests run locally without complex setup
- **CI/CD:** All tests automated with fast feedback loops

---

## Current State Analysis

### ✅ What Exists

#### Frontend E2E Tests (`apps/app`)
```
apps/app/e2e/
├── accounts.spec.ts           # Account management flows
├── auth.spec.ts              # Login/register flows
├── auth.setup.ts             # Authentication state setup
├── budget-calendar-apps.spec.ts
├── categories.spec.ts
├── contacts-debts.spec.ts
├── home.spec.ts
├── overview.spec.ts
├── settings.spec.ts
├── transactions.spec.ts
├── vault.spec.ts
└── workspace.spec.ts
```

**Coverage:** ~11 test files covering main user flows  
**Framework:** Playwright with custom fixtures  
**Auth Strategy:** Persistent auth state via `.auth/user.json`

#### API Unit Tests (`apps/api`)
```
apps/api/modules/mayar/
├── billing.utils.test.ts
└── billing-lifecycle.service.test.ts
```

**Coverage:** Minimal (only billing module)  
**Framework:** Bun Test

#### Shared Playwright Package
```
packages/playwright/
├── index.ts                   # Base config
└── e2e/                       # Shared utilities (exists but minimal)
```

### ❌ What's Missing

1. **No API Integration Tests** - ElysiaJS endpoints untested
2. **No Mobile E2E Tests** - Flutter app has no automated tests
3. **No Cross-app Integration Tests** - App → API → DB flows not tested
4. **No Performance/Load Tests** - API capacity unknown
5. **No Visual Regression Tests** - UI changes not caught visually
6. **No Accessibility Tests** - WCAG compliance not automated
7. **Limited API Coverage** - Only 2 test files for 166+ modules/routes
8. **No Database Testing Strategy** - Schema migrations and seeding not validated
9. **No CI/CD Integration** - Tests not running in GitHub Actions/CI
10. **No Test Data Management** - No fixtures or factories

---

## Testing Architecture

### Testing Pyramid

```
                    ┌─────────────────┐
                    │   E2E Tests     │  ← User journeys (slow, expensive)
                    │  (Playwright)   │
                    └─────────────────┘
                   ┌───────────────────┐
                   │ Integration Tests │  ← API + DB (medium speed)
                   │  (Bun + Elysia)   │
                   └───────────────────┘
                ┌─────────────────────────┐
                │    Unit Tests           │  ← Functions/modules (fast)
                │   (Bun Test + Vitest)   │
                └─────────────────────────┘
```

### Test Distribution Target

| Layer | Quantity | Execution Time | Coverage Target |
|-------|----------|----------------|-----------------|
| Unit | ~500 | <2 min | 80% of utils/logic |
| Integration | ~150 | <3 min | 70% of API endpoints |
| E2E Frontend | ~50 | <5 min | 100% critical paths |
| E2E Mobile | ~30 | <4 min | 100% critical paths |
| Visual | ~20 | <2 min | Key UI components |

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2) 🎯 HIGH PRIORITY

#### ✅ Task 1.1: Enhance Playwright Infrastructure
- [ ] Create shared Page Object Models (POM) in `packages/playwright/page-objects/`
  - [ ] `BasePage.ts` - Common methods (navigation, waiting, assertions)
  - [ ] `AuthPage.ts` - Login/register abstractions
  - [ ] `DashboardPage.ts` - Main app layout
  - [ ] `TransactionPage.ts` - Transaction management
- [ ] Implement test data factories in `packages/playwright/fixtures/`
  - [ ] `UserFactory.ts` - Generate test users
  - [ ] `TransactionFactory.ts` - Generate test transactions
  - [ ] `AccountFactory.ts` - Generate test accounts
- [ ] Add visual regression testing with `@playwright/test` screenshots
  - [ ] Install `pixelmatch` or use built-in Playwright visual comparison
  - [ ] Create baseline screenshots for key pages
- [ ] Enhance `apps/app/e2e/fixtures/index.ts`
  - [ ] Add `workspace` fixture (auto-creates isolated workspace)
  - [ ] Add `testData` fixture (auto-seeds data)
  - [ ] Add `cleanupHooks` fixture (auto-cleanup after tests)

**Files to Create:**
```
packages/playwright/
├── page-objects/
│   ├── index.ts
│   ├── base-page.ts
│   ├── auth-page.ts
│   ├── dashboard-page.ts
│   └── transaction-page.ts
├── fixtures/
│   ├── index.ts
│   ├── user-factory.ts
│   ├── transaction-factory.ts
│   └── account-factory.ts
└── utils/
    ├── test-helpers.ts
    └── visual-comparison.ts
```

#### ✅ Task 1.2: Set Up API Testing Infrastructure
- [ ] Create `apps/api/test/` directory structure
  ```
  apps/api/test/
  ├── setup.ts                  # Global test setup
  ├── helpers.ts                # Test utilities
  ├── fixtures/                 # Test data
  └── integration/              # Integration tests
      ├── auth.test.ts
      ├── transactions.test.ts
      └── accounts.test.ts
  ```
- [ ] Implement test client for ElysiaJS
  - [ ] Create `TestClient` wrapper around Elysia's `.handle()`
  - [ ] Add auth helpers (loginAs, withToken)
  - [ ] Add assertion helpers (expectSuccess, expectError)
- [ ] Set up test database
  - [ ] Create `test.env` for test environment
  - [ ] Implement database seeding scripts for tests
  - [ ] Add transaction rollback after each test
- [ ] Add API test coverage reporting
  - [ ] Configure `bun test --coverage`

**Example Test Client:**
```typescript
// apps/api/test/helpers.ts
import { Elysia } from 'elysia';

export class TestClient {
  constructor(private app: Elysia) {}
  
  async get(path: string, options?: RequestInit) {
    return this.app.handle(new Request(`http://localhost${path}`, {
      method: 'GET',
      ...options
    }));
  }
  
  async post(path: string, body?: any, options?: RequestInit) {
    return this.app.handle(new Request(`http://localhost${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options
    }));
  }
  
  async withAuth(token: string) {
    // Return new client with auth headers
  }
}
```

#### ✅ Task 1.3: Database Testing Strategy
- [ ] Create test database schema in `packages/database/test/`
- [ ] Implement factory pattern for DB entities
  - [ ] Use `@faker-js/faker` for realistic data
  - [ ] Create factories for each table (33 tables)
- [ ] Set up database transaction isolation for tests
  - [ ] Each test gets a clean DB state
  - [ ] Use Drizzle transactions + rollback
- [ ] Create migration testing utilities
  - [ ] Test migrations up/down
  - [ ] Validate schema after migration

**Files to Create:**
```
packages/database/
├── test/
│   ├── setup.ts              # Test DB initialization
│   ├── factories/
│   │   ├── index.ts
│   │   ├── user.factory.ts
│   │   ├── transaction.factory.ts
│   │   └── account.factory.ts
│   └── helpers/
│       ├── db-reset.ts
│       └── seed-test-data.ts
└── migrations/test/          # Test-specific migrations
```

---

### Phase 2: Core API Coverage (Weeks 3-4) 🎯 HIGH PRIORITY

#### ✅ Task 2.1: Authentication & Authorization Tests
- [ ] `apps/api/test/integration/auth.test.ts`
  - [ ] POST `/auth/register` - successful registration
  - [ ] POST `/auth/register` - validation errors
  - [ ] POST `/auth/register` - duplicate email
  - [ ] POST `/auth/login` - successful login
  - [ ] POST `/auth/login` - invalid credentials
  - [ ] POST `/auth/refresh` - token refresh flow
  - [ ] POST `/auth/logout` - logout flow
  - [ ] GET `/auth/me` - get current user
  - [ ] PATCH `/auth/password` - change password

#### ✅ Task 2.2: Core Business Logic Tests
- [ ] `apps/api/test/integration/transactions.test.ts`
  - [ ] POST `/transactions` - create transaction
  - [ ] GET `/transactions` - list with pagination
  - [ ] GET `/transactions/:id` - get single transaction
  - [ ] PATCH `/transactions/:id` - update transaction
  - [ ] DELETE `/transactions/:id` - delete transaction
  - [ ] GET `/transactions/stats` - aggregate statistics
  - [ ] POST `/transactions/bulk` - bulk import
  - [ ] PATCH `/transactions/bulk` - bulk update

- [ ] `apps/api/test/integration/accounts.test.ts`
  - [ ] Full CRUD operations
  - [ ] Account balance calculations
  - [ ] Multi-currency handling

- [ ] `apps/api/test/integration/budgets.test.ts`
  - [ ] Budget creation and tracking
  - [ ] Budget period calculations
  - [ ] Overspending alerts

- [ ] `apps/api/test/integration/categories.test.ts`
  - [ ] Category CRUD
  - [ ] Nested category hierarchy

#### ✅ Task 2.3: Integration Tests (40+ modules)
Test coverage for all modules in `apps/api/modules/`:
- [ ] AI services (`ai-messages`, `ai-sessions`)
- [ ] Audit logs
- [ ] Contacts and debts
- [ ] Invoices
- [ ] Notifications (email, push, in-app)
- [ ] Orders
- [ ] Privacy requests
- [ ] Vault (secure storage)
- [ ] Workspace management
- [ ] Billing (Mayar integration)

**Estimated:** ~80 test files, ~800 test cases

---

### Phase 3: Enhanced Frontend Testing (Weeks 5-6)

#### ✅ Task 3.1: Expand E2E Coverage
- [ ] Add missing user flows
  - [ ] Multi-workspace switching
  - [ ] Team collaboration flows
  - [ ] Subscription upgrade/downgrade
  - [ ] Data export (CSV, PDF)
  - [ ] Bulk operations
  - [ ] Search and filtering

#### ✅ Task 3.2: Visual Regression Testing
- [ ] Configure Playwright visual comparison
  ```typescript
  // apps/app/e2e/visual/
  ├── dashboard.visual.spec.ts
  ├── transactions.visual.spec.ts
  └── settings.visual.spec.ts
  ```
- [ ] Create baseline screenshots
- [ ] Set up Percy.io or Chromatic for cloud-based visual testing
- [ ] Configure threshold for acceptable differences (e.g., 0.1%)

#### ✅ Task 3.3: Accessibility Testing
- [ ] Install `@axe-core/playwright`
- [ ] Add a11y checks to existing tests
  ```typescript
  import { injectAxe, checkA11y } from 'axe-playwright';
  
  test('dashboard should be accessible', async ({ page }) => {
    await page.goto('/en/overview');
    await injectAxe(page);
    await checkA11y(page);
  });
  ```
- [ ] Create dedicated a11y test suite
  - [ ] WCAG 2.1 AA compliance
  - [ ] Keyboard navigation
  - [ ] Screen reader compatibility
  - [ ] Color contrast ratios

#### ✅ Task 3.4: Cross-Browser Testing
- [ ] Add Firefox project to Playwright config
- [ ] Add Safari/WebKit project
- [ ] Add mobile viewports (iOS Safari, Android Chrome)
- [ ] Test responsive layouts

**Updated `playwright.config.ts`:**
```typescript
projects: [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] }, dependencies: ['setup'] },
  { name: 'webkit', use: { ...devices['Desktop Safari'] }, dependencies: ['setup'] },
  { name: 'mobile-chrome', use: { ...devices['Pixel 5'] }, dependencies: ['setup'] },
  { name: 'mobile-safari', use: { ...devices['iPhone 13'] }, dependencies: ['setup'] },
]
```

---

### Phase 4: Mobile Testing (Weeks 7-8)

#### ✅ Task 4.1: Flutter Integration Tests
- [ ] Set up Flutter test environment
  ```
  apps/native/integration_test/
  ├── app_test.dart             # Main test runner
  ├── auth_flow_test.dart
  ├── transaction_flow_test.dart
  └── sync_test.dart
  ```
- [ ] Configure `integration_test` package
- [ ] Add test database for mobile
- [ ] Mock API responses with `http_mock_adapter`

#### ✅ Task 4.2: Core Mobile Flows
- [ ] Authentication flow
  - [ ] Login with email/password
  - [ ] OAuth login (Google, GitHub)
  - [ ] Biometric authentication (Face ID, Touch ID)
  - [ ] Session persistence
- [ ] Transaction management
  - [ ] Create/edit/delete transactions
  - [ ] Offline mode
  - [ ] Sync when online
- [ ] Notifications
  - [ ] Push notification handling
  - [ ] In-app notifications

#### ✅ Task 4.3: Mobile-Specific Tests
- [ ] Offline/online mode switching
- [ ] Background sync
- [ ] Deep linking
- [ ] App state restoration
- [ ] Device orientation changes
- [ ] Different screen sizes (tablet, phone)

**Example Flutter Test:**
```dart
// apps/native/integration_test/transaction_flow_test.dart
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Create transaction flow', (WidgetTester tester) async {
    app.main();
    await tester.pumpAndSettle();

    // Navigate to transactions
    await tester.tap(find.byKey(Key('transactions_tab')));
    await tester.pumpAndSettle();

    // Tap create button
    await tester.tap(find.byKey(Key('create_transaction_button')));
    await tester.pumpAndSettle();

    // Fill form
    await tester.enterText(find.byKey(Key('amount_field')), '100.00');
    await tester.enterText(find.byKey(Key('description_field')), 'Test transaction');

    // Submit
    await tester.tap(find.byKey(Key('submit_button')));
    await tester.pumpAndSettle();

    // Verify
    expect(find.text('Test transaction'), findsOneWidget);
  });
}
```

---

### Phase 5: Performance & Load Testing (Weeks 9-10)

#### ✅ Task 5.1: API Performance Tests
- [ ] Install `autocannon` or `k6` for load testing
- [ ] Create performance test suite
  ```
  apps/api/test/performance/
  ├── load-test.ts              # General load testing
  ├── stress-test.ts            # Stress testing
  └── spike-test.ts             # Spike testing
  ```
- [ ] Define performance budgets
  - [ ] Response time: p95 < 200ms, p99 < 500ms
  - [ ] Throughput: >1000 req/s
  - [ ] Error rate: <0.1%

**Example with k6:**
```javascript
// apps/api/test/performance/load-test.js
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function() {
  let res = http.get('http://localhost:3002/transactions');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });
}
```

#### ✅ Task 5.2: Database Performance Tests
- [ ] Query performance benchmarks
- [ ] Index effectiveness tests
- [ ] Connection pool sizing tests
- [ ] Migration performance tests

#### ✅ Task 5.3: Frontend Performance Tests
- [ ] Lighthouse CI integration
- [ ] Core Web Vitals monitoring
  - [ ] LCP (Largest Contentful Paint) < 2.5s
  - [ ] FID (First Input Delay) < 100ms
  - [ ] CLS (Cumulative Layout Shift) < 0.1
- [ ] Bundle size budgets

---

### Phase 6: Cross-Service Integration (Weeks 11-12)

#### ✅ Task 6.1: End-to-End User Journeys
- [ ] Full user lifecycle tests (spanning all apps)
  ```
  tests/e2e-integration/
  ├── user-onboarding.spec.ts   # Website → App → API
  ├── subscription-flow.spec.ts  # App → API → Billing
  ├── data-sync.spec.ts         # Mobile → API → Web
  └── admin-panel.spec.ts       # Admin → API → Database
  ```

#### ✅ Task 6.2: Third-Party Integration Tests
- [ ] Payment processing (Stripe, Mayar)
  - [ ] Use Stripe test mode
  - [ ] Mock webhooks
- [ ] Email delivery (SMTP)
  - [ ] Use Mailhog or similar for testing
- [ ] SMS notifications
- [ ] OAuth providers (Google, GitHub)
  - [ ] Mock OAuth flows in tests
- [ ] External API integrations
  - [ ] QuickBooks, Xero, etc.
  - [ ] Use sandbox environments

#### ✅ Task 6.3: Real-time Features
- [ ] WebSocket connection tests
- [ ] Server-Sent Events (SSE) tests
- [ ] Push notification delivery
- [ ] Multi-device sync

---

### Phase 7: CI/CD Integration (Weeks 13-14)

#### ✅ Task 7.1: GitHub Actions Workflow
- [ ] Create `.github/workflows/test.yml`
  ```yaml
  name: Test Suite
  
  on:
    pull_request:
    push:
      branches: [main, development]
  
  jobs:
    unit-tests:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: oven-sh/setup-bun@v1
        - run: bun install
        - run: bun run test
  
    api-integration:
      runs-on: ubuntu-latest
      services:
        postgres:
          image: postgres:16
          env:
            POSTGRES_PASSWORD: postgres
          options: >-
            --health-cmd pg_isready
            --health-interval 10s
        redis:
          image: redis:7
      steps:
        - uses: actions/checkout@v4
        - uses: oven-sh/setup-bun@v1
        - run: bun install
        - run: bun run db:push
        - run: bun test apps/api/test/integration
  
    e2e-web:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: oven-sh/setup-bun@v1
        - run: bun install
        - run: bunx playwright install --with-deps
        - run: bun run test:e2e
        - uses: actions/upload-artifact@v4
          if: failure()
          with:
            name: playwright-report
            path: apps/app/playwright-report/
  
    e2e-mobile:
      runs-on: macos-latest
      steps:
        - uses: actions/checkout@v4
        - uses: subosito/flutter-action@v2
        - run: flutter test integration_test
  ```

#### ✅ Task 7.2: Test Parallelization
- [ ] Configure Playwright sharding
  ```bash
  # Run tests in 4 parallel jobs
  npx playwright test --shard=1/4
  npx playwright test --shard=2/4
  npx playwright test --shard=3/4
  npx playwright test --shard=4/4
  ```
- [ ] Optimize test execution time
  - [ ] Current target: <10 minutes total
  - [ ] Split by test type (unit, integration, e2e)

#### ✅ Task 7.3: Test Reporting & Monitoring
- [ ] Integrate test results with GitHub PR comments
- [ ] Set up test coverage reporting (Codecov or similar)
- [ ] Create test dashboard (Allure Reports or similar)
- [ ] Set up test flakiness detection
- [ ] Configure failure notifications (Slack, Discord)

---

## Testing Layers

### 1. Unit Tests (Fast, Isolated)

**What to Test:**
- Utility functions (`packages/utils`)
- Business logic functions
- Data transformations
- Validation schemas (Zod)
- Pure functions

**Tools:**
- Bun Test (primary)
- Vitest (alternative for complex mocking)

**Example:**
```typescript
// packages/utils/currency.test.ts
import { describe, expect, test } from 'bun:test';
import { formatCurrency, convertCurrency } from './currency';

describe('formatCurrency', () => {
  test('formats USD correctly', () => {
    expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
  });

  test('formats EUR with proper symbol', () => {
    expect(formatCurrency(1234.56, 'EUR')).toBe('€1,234.56');
  });
});
```

### 2. Integration Tests (Medium Speed, API + DB)

**What to Test:**
- API endpoints
- Database queries
- Server actions
- Third-party integrations

**Tools:**
- Bun Test
- Custom TestClient for ElysiaJS
- Drizzle ORM with test transactions

**Example:**
```typescript
// apps/api/test/integration/transactions.test.ts
import { describe, expect, test, beforeEach } from 'bun:test';
import { TestClient } from '../helpers';
import { db } from '@workspace/database';
import { UserFactory, TransactionFactory } from '../fixtures';

describe('POST /transactions', () => {
  let client: TestClient;
  let user: User;

  beforeEach(async () => {
    await db.transaction(async (tx) => {
      user = await UserFactory.create(tx);
      client = new TestClient().withAuth(user.token);
    });
  });

  test('creates a transaction successfully', async () => {
    const payload = {
      amount: 100.50,
      description: 'Test transaction',
      category_id: 'cat_123',
    };

    const response = await client.post('/transactions', payload);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.amount).toBe(100.50);
    expect(data.description).toBe('Test transaction');
  });

  test('validates required fields', async () => {
    const response = await client.post('/transactions', {});
    expect(response.status).toBe(400);

    const error = await response.json();
    expect(error.errors).toContain('amount is required');
  });
});
```

### 3. E2E Tests (Slow, Full User Flows)

**What to Test:**
- Critical user journeys
- Multi-step workflows
- Cross-page interactions
- Real browser behavior

**Tools:**
- Playwright
- Page Object Model pattern
- Custom fixtures

**Example:**
```typescript
// apps/app/e2e/transaction-creation.spec.ts
import { test, expect } from './fixtures';
import { DashboardPage, TransactionPage } from '@workspace/playwright/page-objects';

test.describe('Transaction Creation Flow', () => {
  test('user can create a new expense transaction', async ({ page, dictionary }) => {
    const dashboard = new DashboardPage(page);
    const transactions = new TransactionPage(page);

    // Navigate to transactions
    await dashboard.goto();
    await dashboard.clickTransactions();

    // Create new transaction
    await transactions.clickCreateButton();
    await transactions.fillForm({
      type: 'expense',
      amount: '150.00',
      description: 'Office supplies',
      category: 'Business Expenses',
    });
    await transactions.submit();

    // Verify creation
    await expect(page.getByText('Office supplies')).toBeVisible();
    await expect(page.getByText('-$150.00')).toBeVisible();
  });
});
```

### 4. Visual Regression Tests

**What to Test:**
- UI component appearance
- Layout consistency
- Responsive design
- Theme variations

**Tools:**
- Playwright screenshots
- Percy.io or Chromatic (optional)

**Example:**
```typescript
// apps/app/e2e/visual/dashboard.visual.spec.ts
import { test, expect } from '../fixtures';

test.describe('Dashboard Visual Regression', () => {
  test('dashboard matches baseline', async ({ page }) => {
    await page.goto('/en/overview');
    await page.waitForLoadState('networkidle');

    // Take screenshot and compare
    await expect(page).toHaveScreenshot('dashboard.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('dark theme matches baseline', async ({ page }) => {
    await page.goto('/en/overview');
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });

    await expect(page).toHaveScreenshot('dashboard-dark.png');
  });
});
```

### 5. Performance Tests

**What to Test:**
- API response times
- Database query performance
- Page load times
- Bundle sizes

**Tools:**
- k6 or autocannon (load testing)
- Lighthouse CI
- Bun Test with benchmarking

**Example:**
```typescript
// apps/api/test/performance/api-benchmark.test.ts
import { test } from 'bun:test';
import { Bench } from 'tinybench';

test('API endpoint performance', async () => {
  const bench = new Bench({ time: 1000 });

  bench
    .add('GET /transactions', async () => {
      await fetch('http://localhost:3002/transactions');
    })
    .add('GET /accounts', async () => {
      await fetch('http://localhost:3002/accounts');
    });

  await bench.run();

  console.table(bench.table());

  // Assert performance budget
  const transactionsTask = bench.tasks.find(t => t.name === 'GET /transactions');
  expect(transactionsTask?.result?.mean).toBeLessThan(100); // < 100ms average
});
```

---

## Infrastructure & Tools

### Core Testing Stack

| Layer | Tool | Purpose | Status |
|-------|------|---------|--------|
| E2E (Web) | Playwright | Browser automation | ✅ Installed |
| E2E (Mobile) | Flutter Integration Test | Mobile app testing | ❌ Not set up |
| API Testing | Bun Test | Fast test runner | ✅ Installed |
| Unit Testing | Bun Test / Vitest | Module testing | ⚠️ Partial |
| Visual Regression | Playwright + Percy | UI consistency | ❌ Not set up |
| Accessibility | axe-core | WCAG compliance | ❌ Not set up |
| Performance | k6 | Load testing | ❌ Not set up |
| Coverage | Bun --coverage | Code coverage | ❌ Not configured |

### Supporting Tools

#### Required Dependencies

```bash
# Install these dependencies
bun add -D @faker-js/faker           # Test data generation
bun add -D @axe-core/playwright      # Accessibility testing
bun add -D pixelmatch                # Visual comparison
bun add -D tinybench                 # Benchmarking
bun add -D @vitest/coverage-v8       # Coverage reporting (if using Vitest)

# For load testing (choose one)
bun add -D autocannon                # Simple load testing
# OR use k6 (installed separately)

# For visual regression (optional, cloud service)
# Percy.io or Chromatic - requires account
```

#### Test Database Setup

```bash
# Create test database
createdb oewang_test

# Add to .env.test
DATABASE_URL=postgresql://user:password@localhost:5432/oewang_test
```

### CI/CD Requirements

- **GitHub Actions** (recommended)
- **PostgreSQL 16** service container
- **Redis 7** service container
- **Playwright browsers** (installed in CI)
- **Flutter SDK** (for mobile tests)
- **Docker** (for local testing)

---

## CI/CD Integration

### Local Development Flow

```bash
# Run all tests locally
bun run test:all              # New script to add

# Run specific test types
bun run test:unit             # Unit tests only
bun run test:integration      # API integration tests
bun run test:e2e              # Frontend E2E
bun run test:e2e:mobile       # Mobile E2E
bun run test:visual           # Visual regression
bun run test:a11y             # Accessibility

# Watch mode for development
bun run test:watch

# Coverage report
bun run test:coverage
```

### GitHub Actions Strategy

#### 1. Pull Request Checks (Required)
```yaml
# .github/workflows/pr-checks.yml
- Unit tests (all packages)
- API integration tests
- E2E tests (critical paths only)
- Linting and type checking
```

**Estimated time:** 5-7 minutes

#### 2. Main Branch Checks (Comprehensive)
```yaml
# .github/workflows/main-checks.yml
- All unit tests
- All integration tests
- Full E2E suite (all browsers)
- Visual regression tests
- Performance tests
- Accessibility tests
```

**Estimated time:** 15-20 minutes

#### 3. Nightly Tests (Full Suite + Extras)
```yaml
# .github/workflows/nightly.yml
- All tests from main branch
- Load/stress tests
- Cross-browser compatibility
- Mobile E2E tests
- Database migration tests
```

**Estimated time:** 30-45 minutes

### Test Artifacts

Store the following in CI:
- Playwright HTML reports
- Playwright traces (for failed tests)
- Screenshots (visual regression)
- Coverage reports
- Performance metrics
- Test execution times

---

## Best Practices

### 1. Test Organization

#### File Naming Conventions
- Unit tests: `*.test.ts` (in same directory as source)
- Integration tests: `*.test.ts` (in `test/integration/`)
- E2E tests: `*.spec.ts` (in `e2e/`)
- Visual tests: `*.visual.spec.ts`

#### Test Structure (AAA Pattern)
```typescript
test('should create transaction', async () => {
  // Arrange - Set up test data
  const user = await UserFactory.create();
  const payload = { amount: 100, description: 'Test' };

  // Act - Perform the action
  const response = await client.post('/transactions', payload);

  // Assert - Verify the result
  expect(response.status).toBe(201);
  expect(response.data.amount).toBe(100);
});
```

### 2. Test Data Management

#### Use Factories, Not Hard-coded Data
```typescript
// ❌ Bad: Hard-coded data
const user = {
  id: 'user_123',
  email: 'test@example.com',
  name: 'Test User',
};

// ✅ Good: Factory with realistic data
const user = await UserFactory.create({
  email: 'unique@example.com', // Override specific fields
});
```

#### Clean Up After Tests
```typescript
// Use transactions for database tests
test('creates user', async () => {
  await db.transaction(async (tx) => {
    const user = await UserFactory.create(tx);
    // Test runs here
    // Automatic rollback after test
  });
});
```

### 3. Avoiding Test Flakiness

#### Wait for Explicit Conditions
```typescript
// ❌ Bad: Arbitrary delays
await page.waitForTimeout(1000);

// ✅ Good: Wait for specific condition
await page.waitForSelector('[data-testid="transaction-list"]');
await page.waitForLoadState('networkidle');
```

#### Use Test IDs
```tsx
// In React component
<button data-testid="create-transaction-btn">Create</button>

// In test
await page.getByTestId('create-transaction-btn').click();
```

### 4. Performance Optimization

#### Parallelize Independent Tests
```typescript
// Playwright automatically runs tests in parallel
// For heavy tests, consider:
test.describe.configure({ mode: 'parallel' });
```

#### Share Expensive Setup
```typescript
// Use beforeAll for expensive setup
let testDatabase;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
  await testDatabase.migrate();
});

afterAll(async () => {
  await testDatabase.destroy();
});
```

### 5. Test Coverage Guidelines

#### What to Test (Priority Order)
1. **Critical paths** - User registration, login, payment
2. **Business logic** - Calculations, validations, state changes
3. **Edge cases** - Boundary values, error conditions
4. **Integration points** - External APIs, database queries
5. **UI interactions** - Forms, navigation, data display

#### What NOT to Test
- Third-party library internals
- Framework features (Next.js, Elysia, etc.)
- Trivial getters/setters
- Generated code

### 6. Debugging Failed Tests

#### Playwright Debugging
```bash
# Run with UI mode
bun run test:e2e:ui

# Run with debugger
PWDEBUG=1 bun run test:e2e

# Generate trace
npx playwright test --trace on
npx playwright show-trace trace.zip
```

#### Bun Test Debugging
```bash
# Run specific test file
bun test apps/api/test/integration/transactions.test.ts

# Run with verbose output
bun test --verbose

# Run with debugger
bun --inspect test
```

---

## Appendix

### A. Checklist Summary

#### Phase 1: Foundation ✅
- [ ] 1.1: Playwright infrastructure (POMs, fixtures, visual)
- [ ] 1.2: API testing infrastructure (test client, DB setup)
- [ ] 1.3: Database testing (factories, migrations)

#### Phase 2: API Coverage ✅
- [ ] 2.1: Auth tests (9 test cases)
- [ ] 2.2: Core business logic (24 modules × ~10 tests = 240 tests)
- [ ] 2.3: Integration tests (40+ modules)

#### Phase 3: Frontend ✅
- [ ] 3.1: Expand E2E coverage (new user flows)
- [ ] 3.2: Visual regression (baseline + tests)
- [ ] 3.3: Accessibility (axe-core integration)
- [ ] 3.4: Cross-browser (Firefox, Safari, mobile)

#### Phase 4: Mobile ✅
- [ ] 4.1: Flutter test setup
- [ ] 4.2: Core mobile flows
- [ ] 4.3: Mobile-specific tests (offline, sync, etc.)

#### Phase 5: Performance ✅
- [ ] 5.1: API performance tests (load, stress, spike)
- [ ] 5.2: Database performance benchmarks
- [ ] 5.3: Frontend performance (Lighthouse CI)

#### Phase 6: Integration ✅
- [ ] 6.1: Cross-service E2E journeys
- [ ] 6.2: Third-party integrations (Stripe, email, OAuth)
- [ ] 6.3: Real-time features (WebSocket, SSE, push)

#### Phase 7: CI/CD ✅
- [ ] 7.1: GitHub Actions workflows
- [ ] 7.2: Test parallelization and optimization
- [ ] 7.3: Reporting and monitoring

### B. Estimated Effort

| Phase | Duration | Developer Days | Dependencies |
|-------|----------|----------------|--------------|
| Phase 1 | 2 weeks | 10 days | None |
| Phase 2 | 2 weeks | 10 days | Phase 1 |
| Phase 3 | 2 weeks | 8 days | Phase 1 |
| Phase 4 | 2 weeks | 8 days | Phase 1 |
| Phase 5 | 2 weeks | 6 days | Phase 1, 2 |
| Phase 6 | 2 weeks | 8 days | Phase 1-5 |
| Phase 7 | 2 weeks | 6 days | Phase 1-6 |
| **Total** | **14 weeks** | **56 days** | — |

**Assumptions:**
- 1 developer working full-time
- 2 developers can reduce to ~8-9 weeks
- Phases 3-5 can run in parallel

### C. Key Metrics to Track

#### Test Metrics
- **Total test count** (target: 1500+)
- **Test execution time** (target: <10 min)
- **Code coverage** (target: 80%+)
- **Flakiness rate** (target: <2%)

#### Quality Metrics
- **Bug escape rate** (bugs found in production vs. caught in tests)
- **Test confidence score** (subjective, team survey)
- **Time to fix failed tests** (target: <1 hour)

#### Performance Metrics
- **API response time** (p95 < 200ms)
- **Page load time** (LCP < 2.5s)
- **Test suite growth** (tests added per sprint)

### D. Resources & References

#### Documentation
- [Playwright Docs](https://playwright.dev/)
- [Bun Test Docs](https://bun.sh/docs/cli/test)
- [Elysia Testing](https://elysiajs.com/patterns/testing.html)
- [Flutter Integration Tests](https://docs.flutter.dev/testing/integration-tests)
- [k6 Load Testing](https://k6.io/docs/)

#### Tools
- [Faker.js](https://fakerjs.dev/) - Test data generation
- [Playwright Inspector](https://playwright.dev/docs/inspector) - Debug Playwright tests
- [Percy.io](https://percy.io/) - Visual regression testing
- [Chromatic](https://www.chromatic.com/) - Visual testing for Storybook
- [Codecov](https://codecov.io/) - Code coverage reporting

#### Example Repositories
- [Turborepo Kitchen Sink](https://github.com/vercel/turborepo/tree/main/examples/kitchen-sink)
- [Next.js E2E Example](https://github.com/vercel/next.js/tree/canary/examples/with-playwright)
- [Elysia Testing Example](https://github.com/elysiajs/elysia/tree/main/test)

---

## Next Steps

### Immediate Actions (Week 1)
1. **Review this roadmap** with the team
2. **Set up test database** (`oewang_test`)
3. **Install required dependencies**
4. **Create initial directory structure**
5. **Write first Page Object Model** (AuthPage)
6. **Write first API integration test** (auth endpoint)

### Questions to Answer
- [ ] Do we have a test environment separate from dev?
- [ ] What's our CI/CD platform? (GitHub Actions assumed)
- [ ] Do we need visual regression testing immediately?
- [ ] What's the priority for mobile testing?
- [ ] Do we have budget for paid tools (Percy, Chromatic)?

### Communication Plan
- **Weekly test coverage reports** (every Friday)
- **Test failure alerts** (Slack notification)
- **Monthly test metrics review** (in sprint retro)

---

**Document Owner:** Engineering Team  
**Last Review:** 2026-05-18  
**Next Review:** 2026-06-18

---

*This roadmap is a living document. Update it as the testing strategy evolves.*
