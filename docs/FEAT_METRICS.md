# Feature: Metrics & Analytics

> See also: [CLAUDE.md](../CLAUDE.md) · [FEAT_TRANSACTIONS.md](./FEAT_TRANSACTIONS.md) · [FEAT_CATEGORIES.md](./FEAT_CATEGORIES.md) · [FEAT_WALLETS.md](./FEAT_WALLETS.md)

---

## 🤖 AI Agent: Update This Doc When

- Adding new metric endpoints to `apps/api/modules/metrics/metrics.controller.ts`
- Changing aggregation logic in `apps/api/modules/metrics/metrics.service.ts`
- Adding chart data transformations in `apps/api/modules/metrics/metrics.utils.ts`

---

## Purpose

The Metrics module provides aggregated financial analytics for the Overview page and dashboard charts. It computes time-series data (revenue, expenses, burn rate, net worth) over configurable date ranges, with automatic month gap-filling and running average calculation.

---

## API Endpoints

Base path: `/v1/metrics`

| Method | Path                  | Description                                       |
| ------ | --------------------- | ------------------------------------------------- |
| `GET`  | `/revenue`            | Monthly income totals (last 12 months by default) |
| `GET`  | `/expenses`           | Monthly expense totals                            |
| `GET`  | `/burn-rate`          | Monthly net cash flow (income - expenses)         |
| `GET`  | `/net-worth`          | Running net worth over time                       |
| `GET`  | `/category-breakdown` | Spending breakdown by category                    |
| `GET`  | `/top-wallets`        | Wallets ranked by balance                         |
| `GET`  | `/overview`           | All overview stats in a single call               |

**Query params (all endpoints):**

- `startDate` — ISO date string (default: 12 months ago from start of month)
- `endDate` — ISO date string (default: end of current month)

---

## Business Logic

### Default Date Range

If no dates are provided:

- `startDate` = start of month, 11 months ago
- `endDate` = end of current month

This gives a 12-month rolling window.

### Gap Filling

`MetricsService.fillMissingMonths()` takes the sparse DB results (only months with transactions) and fills in zero values for months with no activity. This ensures chart lines are continuous.

### Running Average

After gap-filling, the service computes a `runningTotal` across all months and divides by the count to produce an `average` field on each `ChartDataPoint`. This is used to render the average trend line on charts.

### ChartDataPoint Shape

```ts
type ChartDataPoint = {
  name: string; // e.g. "Jan '25"
  current: number; // value for that month
  average?: number; // running average (added by fillMissingMonths)
};
```

### Category Breakdown

Returns top N categories by total spending, with percentage of total. Used for the donut/pie chart on the Overview page.

---

## Source Files

| Layer      | File                                                        |
| ---------- | ----------------------------------------------------------- |
| Controller | `apps/api/modules/metrics/metrics.controller.ts`            |
| Service    | `apps/api/modules/metrics/metrics.service.ts`               |
| Repository | `apps/api/modules/metrics/metrics.repository.ts`            |
| DTOs       | `apps/api/modules/metrics/metrics.dto.ts`                   |
| Utils      | `apps/api/modules/metrics/metrics.utils.ts`                 |
| Tests      | `apps/api/modules/metrics/metrics.utils.test.ts` (44 tests) |
| E2E        | `apps/app/e2e/overview.spec.ts`                             |

---

## Known Constraints

- All metric queries filter by `workspaceId` and `isNull(deletedAt)` — only active transactions are included.
- Transfer transactions (`type = 'transfer'`) are excluded from revenue and expense calculations to avoid double-counting.
- Date range validation: if `startDate > endDate`, returns `400 + VALIDATION_ERROR`.
- No caching currently — all queries hit PostgreSQL. Consider Redis caching if queries become slow at scale.
