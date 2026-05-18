# E2E Testing Quick Start Guide

> **Companion to:** [E2E_TESTING_ROADMAP.md](./E2E_TESTING_ROADMAP.md)  
> **Purpose:** Get testing running TODAY

## 🚀 Day 1: Get Tests Running (2 hours)

### Step 1: Install Dependencies (10 min)
```bash
# Core testing tools
bun add -D @faker-js/faker @axe-core/playwright pixelmatch tinybench

# Optional: Load testing
bun add -D autocannon

# Install Playwright browsers (if not already done)
bunx playwright install --with-deps
```

### Step 2: Set Up Test Database (15 min)
```bash
# Create test database
createdb oewang_test

# Create .env.test file
cat > .env.test << 'EOF'
# Copy all vars from .env, but override database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/oewang_test
REDIS_URL=redis://localhost:6379/1

# Use test mode for external services
NODE_ENV=test
STRIPE_SECRET_KEY=sk_test_...
SUPABASE_URL=https://test.supabase.co
EOF

# Push schema to test database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/oewang_test bun run db:push
```

### Step 3: Run Existing Tests (5 min)
```bash
# Run existing E2E tests
cd apps/app
bun run test:e2e

# Run with UI mode for interactive debugging
bun run test:e2e:ui

# Run existing API tests
cd ../../apps/api
bun test modules/mayar/*.test.ts
```

### Step 4: Create Your First Test (30 min)

#### Option A: Your First API Test
```bash
# Create test directory
mkdir -p apps/api/test/integration

# Create test file
cat > apps/api/test/integration/health.test.ts << 'EOF'
import { describe, expect, test } from 'bun:test';

describe('GET /health', () => {
  test('returns OK status', async () => {
    const response = await fetch('http://localhost:3002/health');
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.status).toBe('ok');
  });
});
EOF

# Run it
bun test apps/api/test/integration/health.test.ts
```

#### Option B: Your First Page Object Model
```bash
# Create POM directory
mkdir -p packages/playwright/page-objects

# Create base page
cat > packages/playwright/page-objects/base-page.ts << 'EOF'
import { Page, expect } from '@playwright/test';

export class BasePage {
  constructor(protected page: Page) {}

  async goto(path: string) {
    await this.page.goto(path);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async waitForElement(selector: string) {
    await this.page.waitForSelector(selector, { state: 'visible' });
  }

  async clickButton(text: string) {
    await this.page.getByRole('button', { name: text }).click();
  }
}
EOF
```

### Step 5: Add Test Scripts to Root package.json (10 min)
```bash
# Add this to root package.json scripts section
cat >> package.json.tmp << 'EOF'
{
  "scripts": {
    "test:all": "bun run test:unit && bun run test:integration && bun run test:e2e",
    "test:unit": "bun test --preload ./test/setup.ts '**/packages/**/*.test.ts'",
    "test:integration": "bun test --preload ./test/setup.ts 'apps/api/test/integration/**/*.test.ts'",
    "test:e2e": "turbo run test:e2e",
    "test:e2e:ui": "cd apps/app && bun run test:e2e:ui",
    "test:watch": "bun test --watch",
    "test:coverage": "bun test --coverage"
  }
}
EOF
```

---

## 📅 Week 1 Priorities (Must-Do)

### Priority 1: Create Test Helpers (Day 1)
- [ ] Create `apps/api/test/helpers.ts` with TestClient
- [ ] Create `apps/api/test/setup.ts` for global test setup
- [ ] Create database factory base class

### Priority 2: Page Object Models (Day 2-3)
- [ ] `packages/playwright/page-objects/base-page.ts`
- [ ] `packages/playwright/page-objects/auth-page.ts`
- [ ] `packages/playwright/page-objects/dashboard-page.ts`
- [ ] Update existing tests to use POMs

### Priority 3: First API Integration Tests (Day 3-4)
- [ ] Auth endpoints (login, register, logout)
- [ ] Transactions CRUD
- [ ] Accounts CRUD

### Priority 4: Test Data Factories (Day 4-5)
- [ ] User factory
- [ ] Transaction factory
- [ ] Account factory
- [ ] Category factory

---

## 🎯 Week 2 Priorities

### Day 6-7: Visual & Accessibility
- [ ] Add baseline screenshots for key pages
- [ ] Integrate `@axe-core/playwright`
- [ ] Create `apps/app/e2e/visual/` directory
- [ ] Create `apps/app/e2e/a11y/` directory

### Day 8-9: More API Coverage
- [ ] Budget endpoints
- [ ] Category endpoints
- [ ] Debt endpoints
- [ ] Contact endpoints

### Day 10: CI/CD Setup
- [ ] Create `.github/workflows/test.yml`
- [ ] Configure PostgreSQL service in CI
- [ ] Add test artifacts upload
- [ ] Set up Slack notifications

---

## 🔥 Quick Wins (Do These First)

### 1. Add Test IDs to Components
```tsx
// Before
<button onClick={handleSubmit}>Create Transaction</button>

// After
<button data-testid="create-transaction-btn" onClick={handleSubmit}>
  Create Transaction
</button>
```

### 2. Create Shared Test Utilities
```typescript
// packages/playwright/utils/test-helpers.ts
export async function loginAsUser(page: Page, email: string, password: string) {
  await page.goto('/en/login');
  await page.getByText('Show other options').click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL('**/overview');
}

export async function createTestTransaction(page: Page, data: TransactionData) {
  // Helper to quickly create transactions in tests
}
```

### 3. Set Up Test Database Seeding
```typescript
// packages/database/test/seed-test-data.ts
export async function seedTestData(tx: Transaction) {
  const user = await tx.insert(users).values({
    id: cuid(),
    email: 'test@example.com',
    // ...
  }).returning();

  const account = await tx.insert(accounts).values({
    id: cuid(),
    user_id: user.id,
    name: 'Test Account',
    // ...
  }).returning();

  return { user, account };
}
```

---

## 🧪 Testing Patterns & Examples

### Pattern 1: API Test with Database Cleanup
```typescript
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { db } from '@workspace/database';

describe('Transactions API', () => {
  let userId: string;

  beforeEach(async () => {
    // Create test user
    const [user] = await db.insert(users).values({
      email: 'test@example.com',
      // ...
    }).returning();
    userId = user.id;
  });

  afterEach(async () => {
    // Clean up
    await db.delete(transactions).where(eq(transactions.user_id, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  test('creates transaction', async () => {
    // Test implementation
  });
});
```

### Pattern 2: E2E Test with Page Objects
```typescript
import { test, expect } from './fixtures';
import { DashboardPage, TransactionPage } from '@workspace/playwright/page-objects';

test('create transaction flow', async ({ page }) => {
  const dashboard = new DashboardPage(page);
  const transactionPage = new TransactionPage(page);

  await dashboard.goto();
  await dashboard.sidebar.clickTransactions();
  
  await transactionPage.clickCreateButton();
  await transactionPage.form.fill({
    amount: '100.00',
    description: 'Test expense',
  });
  await transactionPage.form.submit();

  await expect(transactionPage.successMessage).toBeVisible();
});
```

### Pattern 3: Visual Regression Test
```typescript
import { test, expect } from './fixtures';

test.describe('Visual Regression', () => {
  test('dashboard matches baseline', async ({ page }) => {
    await page.goto('/en/overview');
    await page.waitForLoadState('networkidle');
    
    // Hide dynamic elements (dates, random data)
    await page.evaluate(() => {
      document.querySelectorAll('[data-dynamic]').forEach(el => {
        el.textContent = 'PLACEHOLDER';
      });
    });

    await expect(page).toHaveScreenshot('dashboard.png', {
      maxDiffPixelRatio: 0.01, // Allow 1% difference
    });
  });
});
```

### Pattern 4: Accessibility Test
```typescript
import { test } from './fixtures';
import { injectAxe, checkA11y } from 'axe-playwright';

test('dashboard is accessible', async ({ page }) => {
  await page.goto('/en/overview');
  await injectAxe(page);
  
  await checkA11y(page, null, {
    detailedReport: true,
    detailedReportOptions: {
      html: true,
    },
  });
});
```

---

## 🐛 Debugging Tips

### Playwright Debugging
```bash
# Run in headed mode (see browser)
PWDEBUG=1 bun run test:e2e

# Run specific test file
bunx playwright test apps/app/e2e/transactions.spec.ts

# Run in UI mode (interactive)
bun run test:e2e:ui

# Generate and view trace
bunx playwright test --trace on
bunx playwright show-trace trace.zip
```

### Bun Test Debugging
```bash
# Run with verbose output
bun test --verbose apps/api/test/integration/auth.test.ts

# Run single test case
bun test --test-name-pattern "creates transaction" 

# Run with debugger
bun --inspect-brk test apps/api/test/integration/auth.test.ts
# Then attach debugger from VS Code or Chrome DevTools
```

### Common Issues

#### Issue: "Database connection failed"
```bash
# Solution: Ensure PostgreSQL is running
docker compose up -d postgres

# Check connection
psql postgresql://postgres:postgres@localhost:5432/oewang_test
```

#### Issue: "Playwright tests timeout"
```typescript
// Solution: Increase timeout in playwright.config.ts
export default defineConfig({
  timeout: 120 * 1000, // 2 minutes
  expect: {
    timeout: 10 * 1000, // 10 seconds
  },
});
```

#### Issue: "Auth state not persisted"
```bash
# Solution: Check STORAGE_STATE file exists
ls -la apps/app/.auth/user.json

# Re-run auth setup
bun run test:e2e:login
```

---

## 📊 Success Metrics (Track These)

### Week 1 Goals
- [ ] 5+ API integration tests passing
- [ ] 3+ Page Object Models created
- [ ] Test database set up and seeded
- [ ] CI/CD workflow created (even if basic)

### Week 2 Goals
- [ ] 20+ API tests covering auth, transactions, accounts
- [ ] All existing E2E tests refactored to use POMs
- [ ] Visual regression tests for 5 key pages
- [ ] Accessibility tests for 5 key pages

### Month 1 Goals
- [ ] 100+ total tests (unit + integration + E2E)
- [ ] 50%+ code coverage for API
- [ ] CI/CD running all tests on every PR
- [ ] Test execution time < 5 minutes

---

## 🎓 Learning Resources

### Playwright
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Page Object Models](https://playwright.dev/docs/pom)
- [Visual Comparisons](https://playwright.dev/docs/test-snapshots)

### Bun Testing
- [Bun Test Runner](https://bun.sh/docs/cli/test)
- [Mocking in Bun](https://bun.sh/docs/test/mocks)

### General Testing
- [Testing Trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
- [Test Pyramid](https://martinfowler.com/bliki/TestPyramid.html)

---

## 🆘 Getting Help

### Within the Codebase
```bash
# View existing test for reference
code apps/app/e2e/auth.spec.ts
code apps/api/modules/mayar/billing.utils.test.ts

# Check Playwright config
code apps/app/playwright.config.ts

# See shared utilities
code packages/playwright/index.ts
```

### External Resources
- Ask in team Slack #testing channel
- Check [Playwright Discord](https://discord.com/invite/playwright-807756831384403968)
- Review [full roadmap](./E2E_TESTING_ROADMAP.md)

---

**Next Step:** Pick Priority 1, Day 1 task and start coding! 🚀
