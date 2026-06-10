# Feature: Budgets

> See also: [CLAUDE.md](../CLAUDE.md) · [FEAT_CATEGORIES.md](./FEAT_CATEGORIES.md) · [FEAT_TRANSACTIONS.md](./FEAT_TRANSACTIONS.md) · [FEAT_METRICS.md](./FEAT_METRICS.md)

---

## 🤖 AI Agent: Update This Doc When

- Modifying `packages/database/schema/budgets.ts`
- Adding endpoints to `apps/api/modules/budgets/budgets.controller.ts`
- Changing budget exceeded logic in `apps/api/modules/transactions/transactions.service.ts`

---

## Purpose

Budgets set a monthly spending limit per expense category. The Budget Status endpoint computes how much has been spent vs the budget for a given month/year, enabling the Budget page and chart to show real-time spending progress.

---

## Data Model

### `budgets` table

| Column        | Type                   | Notes                                          |
| ------------- | ---------------------- | ---------------------------------------------- |
| `id`          | `text` (CUID2)         | Primary key                                    |
| `workspaceId` | `text` FK → workspaces | Required                                       |
| `categoryId`  | `text` FK → categories | Required. One budget per category              |
| `amount`      | `decimal(19,4)`        | Monthly budget ceiling                         |
| `period`      | `text`                 | Default `monthly`. Reserved for future periods |
| `createdAt`   | `timestamp`            | Auto                                           |
| `updatedAt`   | `timestamp`            | Auto                                           |
| `deletedAt`   | `timestamp`            | Soft delete                                    |

**Constraint:** Only one active budget per `(workspaceId, categoryId)` pair. Creating a second budget for the same category replaces the first (upsert behavior).

---

## API Endpoints

Base path: `/v1/budgets`

| Method   | Path      | Role Required     | Description                                         |
| -------- | --------- | ----------------- | --------------------------------------------------- |
| `GET`    | `/status` | Any authenticated | Get spent vs budget for all categories (month/year) |
| `POST`   | `/`       | Editor+           | Create a new budget for a category                  |
| `PUT`    | `/:id`    | Editor+           | Update budget amount                                |
| `DELETE` | `/:id`    | Editor+           | Remove a budget                                     |

**Query params for `GET /status`:**

- `month` (1–12) — defaults to current month
- `year` (e.g. 2025) — defaults to current year

**Response shape for `/status`:**

```json
[
  {
    "categoryId": "...",
    "categoryName": "Food & Drink",
    "budgetAmount": "500.00",
    "spent": "320.00",
    "remaining": "180.00",
    "percentage": 64,
    "status": "on_track" // "on_track" | "warning" | "exceeded"
  }
]
```

---

## Business Logic

### Budget Exceeded Notification

`TransactionsService.create()` checks, after each expense transaction with a `categoryId`:

1. Does a budget exist for this category in this workspace?
2. Sum all expenses in the current month for that category.
3. If sum > budget.amount → dispatch a notification of type `budget.exceeded`.

This check is non-blocking (does not fail the transaction creation if the budget check fails).

### Status Calculation

`BudgetsService.getStatus()` runs a query joining `budgets`, `categories`, and aggregated `transactions` for the given month/year. It returns all categories with budgets, computing:

- `spent` = SUM of expense transactions for that category in the month
- `remaining` = `budgetAmount - spent` (can be negative)
- `percentage` = `spent / budgetAmount * 100`
- `status` = `on_track` (<80%), `warning` (80–100%), `exceeded` (>100%)

---

## Source Files

| Layer      | File                                             |
| ---------- | ------------------------------------------------ |
| Schema     | `packages/database/schema/budgets.ts`            |
| Controller | `apps/api/modules/budgets/budgets.controller.ts` |
| Service    | `apps/api/modules/budgets/budgets.service.ts`    |
| Repository | `apps/api/modules/budgets/budgets.repository.ts` |
| Model      | `apps/api/modules/budgets/budgets.model.ts`      |
| E2E        | `apps/app/e2e/budget-calendar-apps.spec.ts`      |
