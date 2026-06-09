# Feature: Billing & Subscription (Mayar)

> See also: [CLAUDE.md](../CLAUDE.md) · [FEAT_WORKSPACES.md](./FEAT_WORKSPACES.md) · [FEAT_SETTINGS.md](./FEAT_SETTINGS.md)

---

## 🤖 AI Agent: Update This Doc When

- Modifying `packages/database/schema/pricing.ts`, `workspace-addons.ts`, or `orders.ts`
- Changing webhook handling in `apps/api/modules/mayar/mayar.controller.ts`
- Modifying billing lifecycle in `apps/api/modules/mayar/billing-lifecycle.service.ts`
- Changing plan limits in `apps/api/modules/mayar/billing.utils.ts`

---

## Purpose

Billing is handled via **Mayar** (an Indonesian payment gateway). Workspaces subscribe to plans that gate features like AI token quota, vault storage, and number of workspaces. Pricing is optimized for Indonesia-first personal/daily tracking, with a low-cost Personal tier and optional add-ons. Billing lifecycle is managed by a cron job that automatically transitions expired subscriptions.

---

## Data Models

### `pricing` table (plan definitions)

| Column              | Type               | Notes                                                                       |
| ------------------- | ------------------ | --------------------------------------------------------------------------- |
| `id`                | `text` (CUID2)     | Primary key                                                                 |
| `name`              | `text`             | Plan name (e.g. `Starter`, `Personal`, `Pro`, `Business`)                   |
| `description`       | `text`             | Optional                                                                    |
| `prices`            | `jsonb`            | Array of `{ currency, monthly, yearly, mayar_monthly_id, mayar_yearly_id }` |
| `mayar_product_id`  | `text`             | Mayar product identifier                                                    |
| `max_vault_size_mb` | `integer`          | Storage quota. Default 100 MB                                               |
| `max_ai_tokens`     | `integer`          | Monthly AI token quota. Default 100                                         |
| `max_workspaces`    | `integer`          | Max workspaces per user. Default 1                                          |
| `features`          | `jsonb` (string[]) | Feature flags for UI                                                        |
| `is_active`         | `boolean`          | Whether plan is visible publicly                                            |
| `is_addon`          | `boolean`          | Whether this is an add-on (not a base plan)                                 |
| `addon_type`        | `text`             | `ai` \| `vault` — for add-ons only                                          |

### `workspace_addons` table

| Column                 | Type                   | Notes                                             |
| ---------------------- | ---------------------- | ------------------------------------------------- |
| `id`                   | `text` (CUID2)         | Primary key                                       |
| `workspace_id`         | `text` FK → workspaces | Required                                          |
| `addon_id`             | `text` FK → pricing    | Required                                          |
| `mayar_transaction_id` | `text`                 | Idempotency key from Mayar                        |
| `status`               | enum                   | `active` \| `cancelled` \| `past_due` \| `unpaid` |
| `amount`               | `integer`              | Amount paid                                       |
| `qty`                  | `integer`              | Quantity purchased (for token packs). Default 1   |

### `orders` table

Historical record of every payment event received from Mayar.

### Workspace Plan Fields (on `workspaces` table)

| Column                    | Notes                                           |
| ------------------------- | ----------------------------------------------- |
| `plan_id`                 | FK → pricing                                    |
| `plan_status`             | `free` \| `active` \| `past_due` \| `cancelled` |
| `plan_billing_interval`   | `monthly` \| `annual`                           |
| `mayar_customer_email`    | Customer email on file with Mayar               |
| `mayar_transaction_id`    | Last Mayar transaction ID (idempotency)         |
| `plan_started_at`         | When current period started                     |
| `plan_current_period_end` | When current subscription period expires        |
| `plan_overdue_started_at` | When `past_due` state began                     |
| `plan_last_reminder_at`   | Last time a renewal reminder was sent           |

---

## API Endpoints

### Authenticated (admin-only via system_role)

Base path: `/v1/pricing`

| Method   | Path   | Description                     |
| -------- | ------ | ------------------------------- |
| `GET`    | `/`    | List all pricing plans          |
| `GET`    | `/:id` | Get a specific plan             |
| `POST`   | `/`    | Create a plan (superadmin only) |
| `PATCH`  | `/:id` | Update a plan                   |
| `DELETE` | `/:id` | Soft-delete a plan              |

### Public (no auth)

| Method | Path              | Description                              |
| ------ | ----------------- | ---------------------------------------- |
| `GET`  | `/public/pricing` | Public plan listing for the pricing page |

### Mayar Webhooks

Base path: `/v1/mayar`

| Method | Path                | Auth          | Description                                 |
| ------ | ------------------- | ------------- | ------------------------------------------- |
| `POST` | `/webhook`          | Mayar token   | Receives payment events from Mayar          |
| `GET`  | `/checkout/:planId` | Workspace JWT | Initiate checkout for a plan                |
| `POST` | `/sync`             | Workspace JWT | Manually sync workspace invoices from Mayar |

---

## Business Logic

### Subscription Lifecycle (Cron Job)

`BillingLifecycleService.processLifecycle()` runs on a schedule (every 6 hours). It:

1. Finds all workspaces where `plan_status = 'active'` AND `plan_current_period_end < now()`
   → Marks as `past_due`, sends payment reminder email + notification

2. Finds all workspaces where `plan_status = 'past_due'` AND `plan_overdue_started_at < now() - 7 days`
   → Downgrades to free plan, sends downgrade email + notification

**Tested in:** `apps/api/modules/mayar/billing-lifecycle.service.test.ts` (2 tests)

### Webhook Event Processing

`MayarService.asyncProcessEvent()` handles Mayar events:

| Event                    | Action                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `payment.received`       | Activate subscription, update `plan_id`, `plan_status → active`, `plan_current_period_end` |
| `payment.failed`         | Send failure email                                                                         |
| `subscription.cancelled` | Set `plan_status → cancelled`                                                              |

Events are idempotent — `mayar_transaction_id` is used as a dedup key. Processing the same `transaction_id` twice is a no-op.

### Checkout Flow

1. Client calls `GET /v1/mayar/checkout/:planId`
2. API creates a Mayar payment link via Mayar REST API, attaching `workspaceId` in `extraData`
3. Returns the Mayar payment URL
4. User completes payment on Mayar's hosted page
5. Mayar fires `payment.received` webhook
6. API activates the subscription

### Period Calculation

`billing.utils.ts` provides:

- `calculatePeriodEnd(startDate, interval)` — adds 1 month or 1 year
- `inferBillingInterval(mayarProductId)` — determines `monthly` | `annual` from Mayar product metadata

### Add-On Purchase

Add-ons (extra AI tokens, extra vault storage) are separate Mayar products (`is_addon: true`). When purchased:

- Creates a `workspace_addons` row
- Updates `workspace.extra_ai_tokens += addon.qty * tokensPerUnit` or `workspace.extra_vault_size_mb`

---

## Source Files

| Layer      | File                                                                 |
| ---------- | -------------------------------------------------------------------- |
| Schema     | `packages/database/schema/pricing.ts`                                |
| Schema     | `packages/database/schema/workspace-addons.ts`                       |
| Schema     | `packages/database/schema/orders.ts`                                 |
| Controller | `apps/api/modules/mayar/mayar.controller.ts`                         |
| Controller | `apps/api/modules/pricing/pricing.controller.ts`                     |
| Controller | `apps/api/modules/pricing/public-pricing.controller.ts`              |
| Service    | `apps/api/modules/mayar/mayar.service.ts`                            |
| Service    | `apps/api/modules/mayar/billing-lifecycle.service.ts`                |
| Service    | `apps/api/modules/pricing/pricing.service.ts`                        |
| Repository | `apps/api/modules/mayar/mayar.repository.ts`                         |
| Utils      | `apps/api/modules/mayar/billing.utils.ts`                            |
| Tests      | `apps/api/modules/mayar/billing-lifecycle.service.test.ts` (2 tests) |
| Tests      | `apps/api/modules/mayar/billing.utils.test.ts` (5 tests)             |
| Frontend   | `apps/app/app/(main)/[locale]/(dashboard)/upgrade/`                  |
| Frontend   | `apps/app/app/(main)/[locale]/(dashboard)/settings/billing/`         |
| Actions    | `apps/app/actions/mayar.actions.ts`                                  |
| E2E        | `apps/app/e2e/upgrade.spec.ts`                                       |

---

## Known Constraints

- `MAYAR_API_KEY` and `MAYAR_WEBHOOK_TOKEN` are required in production. App boots without them in dev (with warnings).
- The Mayar sandbox uses `api.mayar.club`. Production uses `api.mayar.id`. Auto-detected from the API key prefix (`sk_live_`).
- Webhook events are processed **asynchronously** (fire-and-forget via `.catch()`) — the webhook endpoint returns `200 OK` immediately.
- Plan features are stored as a string array in `pricing.features` JSONB. Frontend checks membership in this array for feature gating.
