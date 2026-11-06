# Feature: Budgets

Status: v1, 2026-11-06. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md#615-budgets-bud) BUD-1 to BUD-5. Decision: [D103](../architecture.md#decision-log).

A budget is a monthly spending limit on one expense category, in the workspace currency. The page shows, for one month, what each budgeted category spent against its limit. The chat answers the same question with a canvas.

## Update this doc when

- Changing what counts as spent, the month window, or the thresholds.
- Changing a budget route ([endpoints](../api/endpoints.md#budgets)) or the `budgets` table ([data model](../data-model.md#budgets)).
- Changing the budget page, its filters, or the `budget` canvas.

## Rules

| Rule | Where it lives |
|---|---|
| One live budget per expense category; an income category is refused | `budgets_one_per_category_idx`, `budgets::service::create` |
| Only the limit is editable; another category is another budget | `PATCH /v1/budgets/{id}` takes `amount` only |
| Limit above zero, at most four decimal places | `budgets::service::validate_amount`, `CHECK (amount > 0)` |
| Spent = `sum(base_amount)` of live `expense` transactions in the category, `date >= first day` and `< first day of next month`, UTC | `repositories::budgets::usage` |
| Percent = spent / limit × 100, whole, half away from zero; 0 when there is no limit | `domain::budget::used_percent` |
| State: `warning` from 80%, `over` past 100% (exactly 100% is `warning`) | `domain::budget::BudgetState` |
| Deleting a category deletes its budget, audited | `budgets::service::delete_for_category`, called from `delete_category` |
| Every write leaves `budget.created`, `budget.updated` or `budget.deleted` | `audit::log` in the same transaction |

Nothing is stored about usage, so an edit to an old transaction is reflected the next time the page loads. There is no rollover and no per-month limit: one limit applies to every month.

## The page

`/budget`, in the Finance group after Accounts (PiggyBank icon). The old page's layout, top to bottom:

- **Cards**: Total monthly budget, Total spent, Overall usage (amber from 80%, red past 100%). Totals cover every budget, whatever the filters.
- **Header**: the filter bar (search by category, a Status facet: on track, near the limit, over budget) on the left; the month stepper and New budget on the right.
- **Table**: Category (sticky), Budget, Spent (red when over), Remaining (green, red when negative), Spent % (bar plus figure), and the row menu (Edit, Delete). Every column sorts on the server.
- **Form sheet**: Category (`SelectCategory type="expense"`, creatable, fixed on edit) and Monthly limit (`CurrencyInput` in the workspace currency).
- **Empty states**: "No budgets set" with Create budget; "No budget matches" with Clear filters.

`?month=YYYY-MM`, `?search=`, `?state=`, `?sort=` and `?order=` are in the URL (UI-8). Members see no write controls.

Bar colours live in `src/lib/budgets.ts`, shared by the page and the canvas.

## The canvas

`get_budget_status` (optional `month`) returns the same `BudgetStatus` the page reads, sorted fullest first, and leaves a `budget` artifact when any budget exists ([chat canvas](chat.md#canvas)). The panel shows Spent "of {total} budget", Remaining "{percent}% used", a bar per budget, and the API's summary sentence.

## Not built

- Budget-exceeded notifications: notifications are a non-goal.
- Budget write tools in chat.
- A budget card on the overview.
