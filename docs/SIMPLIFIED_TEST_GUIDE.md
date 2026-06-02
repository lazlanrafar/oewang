# Simplified Test Guide

## 🎯 4 Essential Commands

### 1. `bun run test` - API Unit Tests
Runs all API unit tests - NO database required.

```bash
bun run test
```

**What it tests:**
- Business logic (billing, invoices, webhooks, etc.)
- Utility functions (JWT tokens, signatures, permissions)
- Security functions (webhook verification, role checks)
- Pure calculations and transformations
- **Fast execution (~114ms for 76 tests)** ⚡
- **No DB setup needed** ✅

**Current Coverage:**
- ✅ 76 unit tests across 5 modules
- ✅ Billing lifecycle & calculations
- ✅ Invoice token generation & verification
- ✅ Webhook security (Twilio, Telegram)
- ✅ Workspace permissions & role checks

---

### 2. `bun run test:e2e` - E2E Browser Tests
Runs all frontend tests in a real browser.

```bash
bun run test:e2e
```

**What it tests:**
- All 18 pages (login, dashboard, transactions, etc.)
- User interactions (clicks, forms, navigation)
- Complete user workflows
- Slower execution (~2-10 minutes)

**⚠️ First time only:** Set up authentication:
```bash
cd apps/app
bun run test:e2e:login  # One-time setup
```

---

### 3. `bun run test:e2e:ui` - Interactive E2E
Opens Playwright UI for visual test development.

```bash
bun run test:e2e:ui
```

**Best for:**
- Developing new tests
- Debugging failing tests
- Seeing tests run step-by-step
- Inspecting page state

---

### 4. `bun run test:watch` - Watch Mode
Automatically re-runs tests when files change.

```bash
bun run test:watch
```

**Best for:**
- TDD (Test-Driven Development)
- Active development
- Instant feedback loop

---

### 5. `bun run test:coverage` - Coverage Report
Shows test coverage statistics.

```bash
bun run test:coverage
```

**Outputs:**
- Which files are tested
- Percentage coverage
- Untested code sections

---

## 📊 Quick Comparison

| Command | What | Speed | DB Required | Use When |
|---------|------|-------|-------------|----------|
| `bun run test` | API unit tests | ⚡ Fast | ❌ No | Before every commit |
| `bun run test:e2e` | Browser tests | 🐢 Slow | ❌ No | Before merging PR |
| `bun run test:e2e:ui` | Interactive E2E | 🐢 Slow | ❌ No | Developing tests |
| `bun run test:watch` | Auto-rerun | ⚡ Fast | ❌ No | During development |
| `bun run test:coverage` | Coverage report | ⚡ Fast | ❌ No | Check coverage |

---

## 🚀 Common Workflows

### Daily Development
```bash
# Keep this running while coding
bun run test:watch
```

### Before Commit
```bash
# Quick check - takes ~114ms
bun run test
```

### Before Push/PR
```bash
# Full check
bun run test            # API tests (fast)
bun run test:e2e        # E2E tests (slow)
```

### Debugging a Failing Test
```bash
# For E2E tests - visual debugging
bun run test:e2e:ui

# For API tests - run specific file from apps/api directory
cd apps/api
bun test modules/invoices/invoices.utils.test.ts
```

---

## 🎓 Understanding Test Types

### API Unit Tests (`bun run test`)
**Location:** `apps/api/modules/**/*.test.ts`

**Example:**
```typescript
test('verifies invoice token', async () => {
  const token = await generateInvoiceToken('inv_123', 'ws_456');
  const payload = await verifyInvoiceToken(token);
  expect(payload?.id).toBe('inv_123');
});
```

**Tests:** Business logic, utility functions, calculations
**Database:** ❌ Not required

---

### E2E Tests (`bun run test:e2e`)
**Location:** `apps/app/e2e/*.spec.ts`

**Example:**
```typescript
test('user can create transaction', async ({ page }) => {
  await page.goto('/transactions');
  await page.fill('[name="amount"]', '100');
  await page.click('button[type="submit"]');
  await expect(page.getByText('Transaction created')).toBeVisible();
});
```

**Tests:** Real user interactions in browser, visual UI, navigation

---

## ✅ Current Test Coverage

### API Unit Tests
- **76 tests** across 5 modules (~114ms total)
  - 7 tests: Billing utilities & lifecycle
  - 22 tests: Workspace permissions
  - 24 tests: Invoice JWT tokens
  - 23 tests: Webhook security (Twilio, Telegram, URL parsing)

### E2E Tests
- **115+ E2E tests** in `apps/app/e2e/` (16 test files)
- **18/18 pages covered** (100% page coverage)

### Total
**190+ automated tests** 🎉

---

## 🆘 Troubleshooting

### Tests fail
```bash
# Make sure you're in the project root
pwd  # Should be /Users/boneconsulting/Developer/oewang

# Run unit tests (should always work, no DB needed)
bun run test

# If E2E tests fail with auth error
cd apps/app
bun run test:e2e:login  # Set up auth once
```

### Important Note
**Always use `bun run test`, not `bun test`!**

- ✅ `bun run test` - Runs the test script from package.json (76 unit tests only)
- ❌ `bun test` - Scans ALL test files including broken integration tests

---

## 🎯 Recommended Usage

**Every day:**
```bash
bun run test:watch      # Keep running while coding
```

**Before commit:**
```bash
bun run test            # Quick 114ms check (no DB)
```

**Before PR:**
```bash
bun run test            # API tests
bun run test:e2e        # E2E tests
```

**When developing tests:**
```bash
bun run test:e2e:ui     # Visual E2E debugging
bun run test:watch      # Auto-rerun unit tests
```

---

## 💡 Key Benefits

**Unit Tests (`bun run test`)**
- ✅ Always works, no setup needed
- ⚡ Super fast (~114ms)
- 🎯 Tests all core business logic
- 🔒 Security functions covered
- 📦 Zero external dependencies

---

**That's it! Just 5 simple commands to master. 🚀**
