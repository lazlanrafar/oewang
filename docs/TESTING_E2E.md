# Frontend E2E Testing Guide

> See also: [CLAUDE.md](../CLAUDE.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [BEST_PRACTICE_NEXT_JS.md](./BEST_PRACTICE_NEXT_JS.md) · [TESTING_UNIT.md](./TESTING_UNIT.md)

---

## Overview

All E2E tests use **Playwright** targeting `apps/app` (Next.js 16). Tests run against a real browser (Chromium) with a real authenticated session.

**Current baseline: 115+ E2E tests across 17 spec files — all pages covered.**

```bash
# From apps/app directory (or use --cwd from root)
bun run test:e2e          # run all E2E tests (2–10 min)
bun run test:e2e:ui       # Playwright UI mode (interactive, great for debugging)

# From repo root
bun run --cwd apps/app test:e2e
bun run --cwd apps/app test:e2e:ui
```

---

## 🤖 AI Agent: Keep This Doc Updated

> **If you add a new page route under `(dashboard)/`** — add a corresponding spec file in `apps/app/e2e/` and add a row to the Spec File Inventory below.
> **If you rename a dictionary key** used in a test selector — find all usages via `grep -r "dictionary\.{key}" apps/app/e2e/` and update them.
> **If auth flow changes** (login form, workspace creation) — update `auth.setup.ts` and `auth.spec.ts`.
> **If test count changes significantly** — update the baseline number above and in [TESTING.md](../TESTING.md).

---

## Configuration

`apps/app/playwright.config.ts` — key settings:

```ts
{
  timeout: 120_000,          // 2 minutes per test
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000",
    actionTimeout: 30_000,
    navigationTimeout: 90_000,
  },
  workers: 1,               // serial — prevents auth state conflicts

  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },  // runs auth.setup.ts first
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: ".auth/user.json" },
      dependencies: ["setup"],  // all tests depend on auth setup completing
    },
  ],
  webServer: {
    command: "PORT=3000 bun run dev",  // reuses existing dev server
    reuseExistingServer: !process.env.CI,
  },
}
```

`packages/playwright` contains the shared `baseConfig` extended here.

---

## Spec File Inventory

> 🤖 **AI Agent:** Update this table when adding or removing spec files.

| Spec File                        | Route(s) Tested                                                 | Tests (approx.) | Notes                                                                 |
| -------------------------------- | --------------------------------------------------------------- | --------------- | --------------------------------------------------------------------- |
| `auth.setup.ts`                  | `/en/login`                                                     | —               | Setup only — saves auth state to `.auth/user.json`                    |
| `auth.spec.ts`                   | `/en/login`, `/en/register`                                     | 9               | Public — no auth required                                             |
| `home.spec.ts`                   | `/`                                                             | 2               | Root redirect                                                         |
| `dashboard-navigation.spec.ts`   | All main nav items                                              | 12              | Sidebar navigation + page loads                                       |
| `overview.spec.ts`               | `/en/overview`                                                  | 4               | Dashboard overview page                                               |
| `transactions.spec.ts`           | `/en/transactions`                                              | 6               | Transaction list rendering                                            |
| `transaction-management.spec.ts` | `/en/transactions`                                              | 8               | CRUD + filtering                                                      |
| `accounts.spec.ts`               | `/en/accounts`                                                  | 6               | Wallet/account list                                                   |
| `budget-calendar-apps.spec.ts`   | `/en/budget`, `/en/calendar`, `/en/apps`                        | 7               | Multiple pages                                                        |
| `categories.spec.ts`             | `/en/settings/expense-category`, `/en/settings/income-category` | 10              | Category CRUD                                                         |
| `contacts-debts.spec.ts`         | `/en/contacts`, `/en/debts`                                     | 14              | Contacts + debt management                                            |
| `invoices.spec.ts`               | `/en/invoices`                                                  | 10              | Invoice list + creation                                               |
| `vault.spec.ts`                  | `/en/vault`                                                     | 10              | File upload + management                                              |
| `notifications.spec.ts`          | `/en/notifications`                                             | 8               | Notification list + mark read                                         |
| `settings.spec.ts`               | `/en/settings/*` (7 sub-pages)                                  | 22              | Profile, appearance, billing, members, currency, transaction, wallets |
| `workspace.spec.ts`              | `/en/settings/members`                                          | 8               | Workspace management                                                  |
| `upgrade.spec.ts`                | `/en/upgrade`                                                   | 6               | Pricing + upgrade flow                                                |

---

## Authentication Setup

E2E tests require a real authenticated session. The session is captured once in `auth.setup.ts` and reused across all spec files.

### First-Time Setup

```bash
# Option 1: Automated (email + password)
export PLAYWRIGHT_USER="your-test-account@email.com"
export PLAYWRIGHT_PASS="yourpassword"
bun run test:e2e

# Option 2: Manual (for Google/GitHub OAuth)
PLAYWRIGHT_MANUAL_AUTH=true bun run test:e2e:ui
# Log in manually in the browser window that opens
# Playwright captures the session once you reach /overview
```

The session is saved to `apps/app/.auth/user.json` (gitignored). Re-run `auth.setup.ts` when the session expires.

### How Auth Setup Works

```ts
// e2e/auth.setup.ts
setup("authenticate", async ({ page, dictionary }) => {
  await page.goto("/en/login");

  // Expand the email/password section (hidden behind "Show other options")
  await page.getByText(dictionary.auth.show_other_options).click();
  await page.getByLabel(dictionary.auth.form.email_label).fill(email);
  await page.getByLabel(dictionary.auth.form.password_label).fill(password);
  await page
    .getByRole("button", { name: dictionary.auth.form.login_button })
    .click();

  await page.waitForURL(/\/(overview|create-workspace)/, { timeout: 30_000 });

  // Save the full browser storage state (cookies + localStorage)
  await page.context().storageState({ path: ".auth/user.json" });
});
```

### Public Tests (no auth needed)

```ts
// Use this at the top of spec files that test public routes
test.use({ storageState: { cookies: [], origins: [] } });
```

---

## Fixtures

Tests import from `./fixtures` — not directly from `@playwright/test`:

```ts
// e2e/fixtures/index.ts
export const test = base.extend<{ dictionary: typeof en }>({
  dictionary: async (_, use) => {
    await use(en); // English dictionary — always use for selectors
  },
  page: async ({ page }, use) => {
    // Inject style to suppress Next.js dev overlay (prevents click blocking)
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.innerHTML = `nextjs-portal { display: none !important; }`;
      document.head.appendChild(style);
    });
    await use(page);
  },
});

export { expect } from "@playwright/test";
export const setup = test; // auth.setup.ts uses this alias
```

**Always import from `./fixtures`** — never from `@playwright/test` directly:

```ts
// ✅ CORRECT
import { expect, test } from "./fixtures";

// ❌ FORBIDDEN — skips the dictionary fixture and dev-overlay suppression
import { expect, test } from "@playwright/test";
```

---

## Writing E2E Tests

### Basic Page Test

```ts
import { expect, test } from "./fixtures";

test.describe("Accounts Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/accounts");
    await page.waitForLoadState("domcontentloaded");
  });

  test("should render the accounts page heading", async ({
    page,
    dictionary,
  }) => {
    await expect(
      page.getByRole("heading", { name: dictionary.accounts.title }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("should show wallet list or empty state", async ({
    page,
    dictionary,
  }) => {
    const hasList = await page
      .getByRole("list")
      .isVisible()
      .catch(() => false);
    const isEmpty = await page
      .getByText(dictionary.accounts.empty_state)
      .isVisible()
      .catch(() => false);
    expect(hasList || isEmpty).toBe(true);
  });
});
```

### CRUD Flow Test

```ts
test("user can update their display name", async ({ page, dictionary }) => {
  await page.goto("/en/settings/profile");
  await page.waitForLoadState("domcontentloaded");

  // Wait for hydration signal (save button appearing)
  await expect(
    page.getByRole("button", {
      name: dictionary.settings.profile.update_profile,
    }),
  ).toBeVisible({ timeout: 15_000 });

  // Interact
  const nameInput = page.getByLabel(
    dictionary.settings.profile.form.username_label,
  );
  await nameInput.clear();
  await nameInput.fill("E2E Test User");

  await page
    .getByRole("button", { name: dictionary.settings.profile.update_profile })
    .click();

  // Verify success toast
  await expect(
    page.getByText(dictionary.settings.profile.toast_success),
  ).toBeVisible({ timeout: 10_000 });
});
```

### Handling Optional UI (role-based)

Not all users have edit permissions. Tests must gracefully handle this:

```ts
test("user can create a transaction if they have edit access", async ({
  page,
  dictionary,
}) => {
  await page.goto("/en/transactions");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000); // wait for hydration

  const addBtn = page
    .getByRole("button", { name: dictionary.transactions.add_button })
    .first();
  const isAddVisible = await addBtn.isVisible().catch(() => false);

  if (!isAddVisible) {
    // Viewer role — no edit button expected. Test passes.
    expect(true).toBe(true);
    return;
  }

  // Editor/owner — proceed with creation
  await addBtn.click();
  // ...
});
```

### Using `data-testid` (Preferred for Ambiguous Elements)

For elements without unique ARIA roles or dictionary text, prefer `data-testid`:

```tsx
// In the component:
<button data-testid="create-transaction-btn">+</button>;

// In the test:
await page.getByTestId("create-transaction-btn").click();
```

Add `data-testid` attributes to components that are tested and have no unique text label (icon-only buttons, complex list items).

---

## Selector Priority

Use selectors in this order (most stable → least stable):

1. `page.getByRole("button", { name: dictionary.key })` — ARIA role + dictionary text
2. `page.getByLabel(dictionary.key)` — form inputs via label
3. `page.getByTestId("my-element")` — explicit test ID
4. `page.getByText(dictionary.key)` — visible text
5. `page.locator("h1")` — CSS/tag selectors (avoid for interactive elements)
6. `page.locator(".class-name")` — class names (last resort, brittle)

**Never use:** hardcoded English strings. Always use `dictionary.key` — the dictionary is the source of truth for UI strings.

```ts
// ✅ CORRECT — uses dictionary
await expect(
  page.getByRole("button", { name: dictionary.common.save }),
).toBeVisible();

// ❌ FORBIDDEN — hardcoded string (breaks when i18n changes)
await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
```

---

## Wait Strategies

```ts
// ✅ Prefer explicit waits over arbitrary timeouts
await page.waitForLoadState("domcontentloaded");
await expect(element).toBeVisible({ timeout: 15_000 }); // use as hydration signal

// ✅ Use waitForTimeout sparingly — only when hydration timing is unpredictable
await page.waitForTimeout(2000); // document why

// ❌ Avoid chaining multiple fixed timeouts
await page.waitForTimeout(500);
await page.waitForTimeout(1000);

// ✅ Use waitForURL after navigation
await page.waitForURL(/.*overview/, { timeout: 30_000 });
```

---

## Dev Overlay Suppression

The Next.js dev overlay can block clicks in test mode. The fixture automatically injects a style to hide it:

```ts
// Already handled in e2e/fixtures/index.ts — no need to add in spec files
style.innerHTML = `
  nextjs-portal,
  [data-nextjs-dev-overlay],
  #__next-route-announcer__ {
    display: none !important;
    pointer-events: none !important;
  }
`;
```

If the overlay is still blocking clicks, `auth.setup.ts` applies a broader suppression via `addInitScript`.

---

## Adding Tests for a New Page

When a new route is added under `(dashboard)/`:

1. **Create `e2e/{feature}.spec.ts`** with these minimum tests:
   - Page loads (heading/title visible)
   - Empty state renders correctly
   - Primary CTA renders (if applicable)
   - Basic CRUD flow (create + success toast) — guarded with `isVisible` check

2. **Use dictionary selectors** — never hardcoded English strings

3. **Describe block naming:**

   ```ts
   test.describe("System: {Feature Name}", () => { ... });
   ```

4. **Import from `./fixtures`**, not `@playwright/test`

5. **Update the Spec File Inventory** table in this document

6. Run locally: `bun run test:e2e:ui` — step through the test visually

---

## Debugging Failing Tests

```bash
# Open Playwright UI — watch each step visually
bun run test:e2e:ui

# Run a single spec file
bun run --cwd apps/app test:e2e -- e2e/accounts.spec.ts

# Headed mode (see the browser)
bun run --cwd apps/app test:e2e -- --headed

# Debug mode (pause on failure)
bun run --cwd apps/app test:e2e -- --debug

# Show slow tests
bun run --cwd apps/app test:e2e -- --reporter=line

# View last HTML report
npx playwright show-report apps/app/playwright-report
```

**Common failure reasons:**

| Symptom                              | Likely Cause                         | Fix                                               |
| ------------------------------------ | ------------------------------------ | ------------------------------------------------- |
| `Timeout waiting for element`        | Hydration not complete               | Increase `timeout` or add a hydration signal wait |
| `Element not found`                  | Dictionary key changed               | Run `grep` to find new key                        |
| `Click intercepted by nextjs-portal` | Dev overlay visible                  | Check fixture `addInitScript` is applied          |
| `Auth redirect to /login`            | Session expired                      | Re-run auth setup                                 |
| `Cannot find selector`               | Role changed, component restructured | Use `--headed` to inspect visually                |
| `Test passes locally, fails in CI`   | Timing difference                    | Add `waitForLoadState` or `waitForTimeout`        |

---

## CI Environment

In CI, tests run against a production build (not dev server):

```bash
USE_BUILD=true bun run test:e2e
```

Auth credentials must be set:

```
PLAYWRIGHT_USER=ci-test@example.com
PLAYWRIGHT_PASS=securepassword
```

`.auth/user.json` is **not committed** and **not cached in CI** — auth setup runs fresh for every CI pipeline.

---

## What E2E Tests Cover vs Unit Tests

| Concern                           | Unit Tests | E2E Tests                    |
| --------------------------------- | ---------- | ---------------------------- |
| Business calculation logic        | ✅         | ❌                           |
| Validation rules                  | ✅         | Partial (UI validation only) |
| Page renders correctly            | ❌         | ✅                           |
| Navigation works                  | ❌         | ✅                           |
| Form submission flow              | ❌         | ✅                           |
| Auth redirect behavior            | ❌         | ✅                           |
| Toast notifications               | ❌         | ✅                           |
| CRUD flows (create/update/delete) | ❌         | ✅                           |
| Role-based UI visibility          | ❌         | ✅                           |
| i18n string rendering             | ❌         | ✅                           |
