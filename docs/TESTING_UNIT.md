# Backend Unit Testing Guide

> See also: [CLAUDE.md](../CLAUDE.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [BEST_PRACTICE_ELYSIA.md](./BEST_PRACTICE_ELYSIA.md) · [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md) · [TESTING_E2E.md](./TESTING_E2E.md)

---

## Overview

All backend tests use **Bun's built-in test runner** (`bun:test`). Tests are fast, require no database, and run in ~134ms.

**Current baseline: 404 unit tests across 14 test files — all must pass before merging.**

```bash
# From repo root
bun run test              # run all 404 tests
bun run test:watch        # watch mode (auto-rerun on change)
bun run test:coverage     # generate coverage report

# From apps/api
bun test                            # all tests
bun test modules/wallets            # single module
bun test modules/wallets/wallets.utils.test.ts  # single file
```

---

## 🤖 AI Agent: Keep This Doc Updated

> **If you add, rename, or remove a test file or module — update the Test Inventory table below.**
> If you add a new `.utils.ts` file — create a companion `.utils.test.ts` immediately.
> If test counts change significantly — update the baseline numbers above and in [TESTING.md](../TESTING.md).

---

## File Structure

Tests live **co-located** with the source files they test:

```
apps/api/modules/{feature}/
  {feature}.utils.ts          ← pure helper functions (no side effects)
  {feature}.utils.test.ts     ← unit tests for utils (no DB, no mocks needed)
  __tests__/                  ← service / controller / integration tests
    {feature}.service.test.ts
    {feature}.controller.test.ts
    mocks/
      {feature}.repository.mock.ts
```

**Rules:**

- Every `.utils.ts` file **MUST** have a companion `.utils.test.ts`
- Service tests go in `__tests__/` with repository mocked
- `__tests__/` is currently empty — service/controller tests are the next priority
- No `index.ts` inside `modules/{feature}/` or `__tests__/`

---

## Test Inventory

| Module         | Test File                                  | Tests   | What's Covered                                                                                                                                             |
| -------------- | ------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai`           | `ai/ai.utils.test.ts`                      | 69      | Date parsing, date ranges, UUID validation, amount formatting, receipt detection, intent recognition, wallet extraction                                    |
| `ai`           | `ai/ai.recall.utils.test.ts`               | 7       | Quick-recall aggregation: name grouping, last/avg/min/max price, frequency & recency ordering, transfer/invalid filtering, suggestion cap                  |
| `transactions` | `transactions/transactions.utils.test.ts`  | 66      | Amount sanitization, balance calculations, budget checking/status, amount formatting, amount validation, date ranges                                       |
| `debts`        | `debts/debts.utils.test.ts`                | 50      | Debt status, payment calculations, payment progress, due date checking, label formatting, payment validation, bill splitting                               |
| `wallets`      | `wallets/wallets.utils.test.ts`            | 44      | Balance calculations, sufficiency checks, balance formatting, total balance aggregation, wallet status, name validation, balance change %, wallet grouping |
| `vault`        | `vault/vault.utils.test.ts`                | 44      | Unit conversions, file size validation, storage quota, SHA-256 hashing, file name validation, extension extraction, file type validation, storage status   |
| `metrics`      | `metrics/metrics.utils.test.ts`            | 44      | Default date range, date range resolution, time series gap-filling, percentage change, growth rate, category aggregation, peak value detection             |
| `categories`   | `categories/categories.utils.test.ts`      | 38      | Name validation, name formatting, icon assignment, category grouping, sorting, duplicate detection, default categories                                     |
| `invoices`     | `invoices/invoices.utils.test.ts`          | 24      | JWT token generation/verification, round-trip encoding, expiration handling, security/tampering                                                            |
| `integrations` | `integrations/webhook-security.test.ts`    | 23      | URL parsing with forwarded headers, form body parsing, Evolution API signature, Telegram secret, timing-safe comparisons                                  |
| `workspaces`   | `workspaces/workspace-permissions.test.ts` | 22      | Role normalization, edit permissions, sensitive permissions, assertion throws, permission hierarchy                                                        |
| `mayar`        | `mayar/billing.utils.test.ts`              | 5       | Annual billing detection, period calculations                                                                                                              |
| `mayar`        | `mayar/billing-lifecycle.service.test.ts`  | 2       | Subscription expiration → `past_due`, grace period → downgrade to free                                                                                     |
| `mayar`        | `mayar/mayar.controller.test.ts`           | 2       | Public webhook HTTP status behavior on success/failure paths                                                                                               |
| `users`        | `users/users.utils.test.ts`                | 3       | Workspace ID resolution from mixed `workspaceId`/`workspace_id` payloads and empty input handling                                                          |
| **TOTAL**      | **15 files**                               | **411** | **All core business logic**                                                                                                                                |

---

## Test Patterns

### Pattern 1: Pure Utils Test (most common)

No mocks needed. Just import and call.

```ts
// wallets/wallets.utils.test.ts
import { describe, expect, test } from "bun:test";
import {
  calculateNewBalance,
  hasSufficientBalance,
  validateWalletName,
} from "./wallets.utils";

describe("wallets.utils", () => {
  describe("calculateNewBalance", () => {
    test("adds positive change to balance", () => {
      expect(calculateNewBalance(1000, 500)).toBe(1500);
      expect(calculateNewBalance("1000", 500)).toBe(1500); // also handles string input
    });

    test("subtracts negative change from balance", () => {
      expect(calculateNewBalance(1000, -300)).toBe(700);
    });

    test("can result in negative balance", () => {
      expect(calculateNewBalance(100, -200)).toBe(-100);
    });
  });

  describe("validateWalletName", () => {
    test("rejects empty name", () => {
      const result = validateWalletName("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    test("rejects name longer than 50 characters", () => {
      const result = validateWalletName("A".repeat(51));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not exceed 50 characters");
    });

    test("accepts valid name", () => {
      expect(validateWalletName("Cash").valid).toBe(true);
    });
  });
});
```

### Pattern 2: Service Test with Module Mocks

Use `mock.module()` to replace entire package/module imports. Define mocks **before** importing the module under test.

```ts
// mayar/billing-lifecycle.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";

// State accumulator — captures what mocked functions receive
const state = {
  updates: [] as any[],
  notifications: [] as any[],
};

// Mock external packages FIRST — before importing the service
mock.module("@workspace/email", () => ({
  sendSubscriptionPaymentReminderEmail: mock(async (...args: any[]) => {
    state.reminderEmails.push(args);
    return { success: true };
  }),
}));

mock.module("@workspace/logger", () => ({
  createLogger: () => ({
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  }),
}));

// Mock the repository (never let service tests hit the real DB)
mock.module("./mayar.repository", () => ({
  MayarRepository: {
    findWorkspacesForBillingLifecycle: mock(async () => state.workspaces),
    updateWorkspaceSubscription: mock(
      async (workspaceId: string, data: any) => {
        state.updates.push({ workspaceId, data });
      },
    ),
  },
}));

// Import AFTER mocks are set up
const { BillingLifecycleService } = require("./billing-lifecycle.service");

describe("BillingLifecycleService", () => {
  beforeEach(() => {
    // Reset state between tests — never share state
    state.workspaces = [];
    state.updates = [];
    state.notifications = [];
  });

  it("marks expired active subscriptions as past_due", async () => {
    state.workspaces = [
      {
        workspaceId: "ws_1",
        plan_status: "active",
        plan_current_period_end: new Date(Date.now() - 60_000), // 1 minute ago
        owner_email: "owner@example.com",
      },
    ];

    await BillingLifecycleService.processLifecycle();

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].data.plan_status).toBe("past_due");
  });

  it("downgrades past_due after 7-day grace period", async () => {
    state.workspaces = [
      {
        workspaceId: "ws_2",
        plan_status: "past_due",
        plan_current_period_end: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        plan_overdue_started_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      },
    ];

    await BillingLifecycleService.processLifecycle();

    expect(state.updates[0].data.plan_status).toBe("free");
  });
});
```

### Pattern 3: Permission/Guard Test (assert throws)

```ts
// workspaces/workspace-permissions.test.ts
import { describe, expect, test } from "bun:test";
import { assertCanEditWorkspaceData } from "./workspace-permissions";

describe("assertCanEditWorkspaceData", () => {
  test("does not throw for owner", () => {
    expect(() => assertCanEditWorkspaceData("owner")).not.toThrow();
  });

  test("throws 403 for viewer", () => {
    expect(() => assertCanEditWorkspaceData("viewer")).toThrow();
  });

  test("throws 403 for null (unauthenticated)", () => {
    expect(() => assertCanEditWorkspaceData(null)).toThrow();
  });

  test("error message contains required role info", () => {
    try {
      assertCanEditWorkspaceData("viewer");
      expect(true).toBe(false); // should not reach here
    } catch (error: any) {
      const message = typeof error === "string" ? error : JSON.stringify(error);
      expect(message).toContain("Editor, Admin, or Owner");
    }
  });
});
```

---

## Test Naming Convention

```
should {expected behaviour} when {condition}
```

Or for Bun's `test()` style (shorter):

```
{action} {subject} {condition}
```

**Examples:**

```ts
// describe/test style
test("should return 404 when wallet does not exist", ...)
test("should throw 403 when role is viewer", ...)
test("should return paginated results when limit is set", ...)

// action-subject style (also acceptable)
test("returns CONFLICT when wallet name already exists", ...)
test("handles string balance input", ...)
test("defaults to viewer for null/undefined", ...)
```

---

## Coverage Requirements

| Layer       | Test Type                  | Minimum Coverage                         |
| ----------- | -------------------------- | ---------------------------------------- |
| `.utils.ts` | Unit (no mocks)            | ≥ 90% branch                             |
| Service     | Unit (repository mocked)   | ≥ 80% branch                             |
| Repository  | Integration (real test DB) | ≥ 1 happy + 1 error path per method      |
| Controller  | Integration (HTTP)         | All HTTP status codes + input validation |

Zero coverage on any `.service.ts` file is forbidden. A feature without a service test is incomplete.

```bash
bun run test:coverage   # view coverage report
```

---

## What To Test

### ✅ Always Test

| Category                  | Examples                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| **Business calculations** | Balance updates, amount sanitization, percentage calculations, payment math               |
| **Validation functions**  | Name length, email format, currency code format, amount range                             |
| **Status derivation**     | Wallet status (positive/zero/negative), debt status (paid/partial/unpaid), storage status |
| **Permission logic**      | Role → can/cannot edit, role → can/cannot manage sensitive                                |
| **Edge cases**            | Empty arrays, zero values, negative numbers, string-encoded numbers, null/undefined       |
| **Security functions**    | JWT generation/verification, webhook signature validation, timing-safe comparisons        |
| **Error conditions**      | Missing required fields, duplicate detection, exceeding limits                            |

### ❌ Do Not Test

| Category                   | Reason                   |
| -------------------------- | ------------------------ |
| Elysia framework internals | Framework responsibility |
| Database driver behavior   | Not your code            |
| External API responses     | Mock them instead        |
| Next.js rendering          | Covered by E2E           |

---

## Repository Mock Template

When writing service tests, always mock the repository with this pattern:

```ts
// __tests__/mocks/wallets.repository.mock.ts
import { mock } from "bun:test";

export const mockWalletsRepository = {
  findMany: mock(async () => ({ rows: [], total: 0 })),
  findById: mock(async () => null),
  create: mock(async (data: any) => ({ id: "test-id", ...data })),
  update: mock(async (id: string, _workspaceId: string, data: any) => ({
    id,
    ...data,
  })),
  delete: mock(async () => ({ id: "test-id" })),
};
```

Use `mock()` from `bun:test` (not `jest.fn()`). Reset with `.mockReset()` or reset state in `beforeEach`.

---

## Adding Tests for a New Feature

When you create a new `{feature}.utils.ts`:

1. **Create `{feature}.utils.test.ts` immediately** in the same directory
2. Import from `"bun:test"` — not Jest, not Vitest
3. Follow the `describe` → `describe` → `test` nesting structure
4. Test all exported functions
5. Cover: happy path + edge cases + error conditions
6. Run `bun test modules/{feature}` to confirm all tests pass
7. **Update the Test Inventory table** in this document

When you create a new `{feature}.service.ts`:

1. Create `__tests__/{feature}.service.test.ts`
2. Create `__tests__/mocks/{feature}.repository.mock.ts`
3. Mock all repository methods + external packages (email, logger, redis)
4. Test all service methods: success path + error path (404, 409, 500)
5. Verify `AuditLogsService.log()` was called after mutations

---

## Running Individual Tests

```bash
# From repo root
bun test apps/api/modules/wallets/wallets.utils.test.ts

# From apps/api
bun test modules/wallets/wallets.utils.test.ts

# Run all tests matching a pattern
bun test --filter "calculateNewBalance"

# Watch a specific file
bun test --watch modules/wallets/wallets.utils.test.ts

# With coverage
bun test --coverage modules/wallets
```

---

## Performance Targets

| Metric               | Target             | Current    |
| -------------------- | ------------------ | ---------- |
| Total test execution | < 200ms            | ~134ms ✅  |
| Per-test average     | < 1ms              | ~0.34ms ✅ |
| DB required          | Never (unit tests) | ❌ No ✅   |
| External deps        | Never (all mocked) | ❌ None ✅ |
| Flaky tests          | Zero               | 0 ✅       |

Tests that require a real database go in `__tests__/` as **integration tests** (run separately, use `.env.test`).
