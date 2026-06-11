# Feature: Billing & Subscription (Mayar)

> See also: [CLAUDE.md](../CLAUDE.md) · [FEAT_WORKSPACES.md](./FEAT_WORKSPACES.md) · [FEAT_SETTINGS.md](./FEAT_SETTINGS.md) · [FEAT_VAULT.md](./FEAT_VAULT.md)

---

## 🤖 AI Agent: Update This Doc When

- Modifying `packages/database/schema/pricing.ts`, `workspace-addons.ts`, `orders.ts`, `workspaces.ts` (billing columns), or `billing-invoices.ts`
- Changing webhook handling in `apps/api/modules/mayar/mayar.controller.ts`
- Modifying billing lifecycle in `apps/api/modules/mayar/billing-lifecycle.service.ts`
- Changing plan limits in `apps/api/modules/mayar/billing.utils.ts`
- Touching the cancel / resume / plan-switch endpoints
- Updating vault grace-period or hard-delete behaviour in `vault.service.ts`

---

## Purpose

Billing is handled via **[Mayar](https://docs.mayar.id/)** — an Indonesian payment gateway with one-shot invoice primitives (no native subscription endpoint). Workspaces subscribe to plans that gate features like AI token quota, vault storage, and the number of workspaces a user can own. Pricing is optimised for Indonesia-first personal/daily tracking, with a low-cost Personal tier and optional add-ons.

Because Mayar lacks subscription primitives, all subscription state — renewal, cancellation, scheduled plan switches, past-due grace, downgrade — is modelled in our DB and driven by a cron-backed lifecycle service.

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

Historical record of every payment event received from Mayar. One row per Mayar transaction (idempotent by `mayar_invoice_id`).

### `billing_invoices` table — internal invoice records

Issued automatically by the `payment.received` webhook handler. Persisted locally so users can render and download a real invoice without depending on Mayar's portal.

| Column                 | Type           | Notes                                                                                          |
| ---------------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| `id`                   | `text` (CUID2) | Primary key                                                                                    |
| `workspace_id`         | `text`         | FK → workspaces                                                                                |
| `order_id`             | `text`         | FK → orders (optional)                                                                         |
| `invoice_number`       | `text`         | Human-friendly, per-workspace: `INV-2026-00001`                                                |
| `sequence`             | `integer`      | Numbering source (`SELECT FOR UPDATE` to serialise concurrent issuance)                        |
| `kind`                 | enum           | `subscription` \| `addon` \| `one_time` — drives how the detail page renders                   |
| `plan_id`              | `text`         | FK → pricing (the plan/addon being paid for)                                                   |
| `billing_interval`     | enum           | `monthly` \| `annual` — only for `kind = subscription`                                          |
| `period_start`         | `timestamp`    | Subscription period covered                                                                    |
| `period_end`           | `timestamp`    | Subscription period covered                                                                    |
| `line_items`           | `jsonb`        | `Array<{ description, quantity, unit_amount, amount, meta? }>` — immutable snapshot at issue time |
| `subtotal`             | `bigint`       | Sum of line item amounts                                                                       |
| `tax_amount`           | `bigint`       | Default 0                                                                                      |
| `total`                | `bigint`       | `subtotal + tax_amount`                                                                        |
| `currency`             | `text`         | ISO code (e.g. `IDR`, `USD`)                                                                   |
| `billing_email`        | `text`         | Snapshot of payer email at issue time                                                          |
| `workspace_name`       | `text`         | Snapshot of workspace name at issue time                                                       |
| `mayar_transaction_id` | `text`         | Idempotency key — re-issuing for the same Mayar txn returns the existing row                   |
| `paid_at`              | `timestamp`    | When payment landed in our system                                                              |

### Workspace plan fields (on `workspaces` table)

| Column                          | Notes                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `plan_id`                       | FK → pricing                                                                           |
| `plan_status`                   | `free` \| `active` \| `past_due` \| `cancelled`                                        |
| `plan_billing_interval`         | `monthly` \| `annual`                                                                  |
| `pending_plan_id`               | FK → pricing — set when user schedules a plan switch at renewal                        |
| `pending_plan_billing_interval` | Billing interval for the pending switch                                                |
| `mayar_customer_email`          | Customer email on file with Mayar                                                      |
| `mayar_transaction_id`          | Last Mayar transaction ID (idempotency)                                                |
| `plan_started_at`               | When current period started                                                            |
| `plan_current_period_end`       | When current subscription period expires (renewal / cancellation effective date)       |
| `plan_overdue_started_at`       | When `past_due` state began                                                            |
| `plan_last_reminder_at`         | Last time a renewal reminder was sent                                                  |
| `storage_violation_at`          | When the workspace first exceeded its vault quota — starts the 30-day grace timer      |

---

## API Endpoints

### Pricing (`/v1/pricing` — admin only, except `/public/pricing`)

| Method   | Path              | Description                              |
| -------- | ----------------- | ---------------------------------------- |
| `GET`    | `/`               | List all pricing plans                   |
| `GET`    | `/:id`            | Get a specific plan                      |
| `POST`   | `/`               | Create a plan (superadmin only)          |
| `PATCH`  | `/:id`            | Update a plan                            |
| `DELETE` | `/:id`            | Soft-delete a plan                       |
| `GET`    | `/public/pricing` | Public plan listing (no auth, for marketing page) |

### Mayar (`/v1/mayar`)

| Method | Path                          | Auth          | Description                                                  |
| ------ | ----------------------------- | ------------- | ------------------------------------------------------------ |
| `POST` | `/webhook`                    | Mayar token   | Receives payment events from Mayar                           |
| `POST` | `/checkout`                   | Workspace JWT | Create a checkout session for a plan or add-on               |
| `POST` | `/portal`                     | Workspace JWT | Return the Mayar portal URL                                  |
| `POST` | `/portal/magic-link`          | Workspace JWT | Send a customer-portal magic link to the billing email       |
| `POST` | `/sync`                       | Workspace JWT | Manually reconcile invoices for the current workspace        |
| `GET`  | `/invoices/:id`               | Workspace JWT | Resolve a Mayar invoice's hosted URL                         |
| `POST` | `/cancel-subscription`        | Workspace JWT | Mark current subscription to end at `plan_current_period_end` |
| `POST` | `/resume-subscription`        | Workspace JWT | Undo a `cancelled` status while still inside the paid period |
| `POST` | `/schedule-plan-switch`       | Workspace JWT | Persist a plan change to apply at next renewal               |
| `POST` | `/cancel-pending-plan-switch` | Workspace JWT | Clear a scheduled plan change                                |
| `POST` | `/cancel-addon`               | Workspace JWT | Cancel an add-on at the next period end                      |

All authenticated Mayar endpoints require the **`owner` or `admin` workspace role** (enforced by `assertCanManageSensitiveWorkspace`).

### Billing invoices (`/v1/billing-invoices`)

| Method | Path   | Auth          | Description                                |
| ------ | ------ | ------------- | ------------------------------------------ |
| `GET`  | `/`    | Workspace JWT | List invoices for the current workspace    |
| `GET`  | `/:id` | Workspace JWT | Get a single invoice with line items + totals |

---

## Business Logic

### Subscription lifecycle (cron job)

`BillingLifecycleService.processLifecycle()` runs on a schedule (every 6 hours). For each workspace whose `plan_current_period_end` has passed, it walks a state machine:

```
                           ┌──────────────────────────────────────┐
                           │ plan_status === "cancelled"           │
                           │  → downgradeWorkspace("cancelled")    │
                           │    (also starts vault grace if over)  │
                           └──────────────────────────────────────┘

                           ┌──────────────────────────────────────┐
                           │ plan_status === "active"              │
                           │   AND pending_plan_id is set          │
                           │  → swap plan_id ← pending_plan_id     │
                           │  → mark past_due, send reminder       │
                           └──────────────────────────────────────┘

                           ┌──────────────────────────────────────┐
                           │ plan_status === "active"              │
                           │   no pending switch                    │
                           │  → mark past_due, send reminder        │
                           └──────────────────────────────────────┘

                           ┌──────────────────────────────────────┐
                           │ plan_status === "past_due"            │
                           │   < 7 days overdue                     │
                           │  → escalating reminder every 3 days    │
                           │   ≥ 7 days overdue                     │
                           │  → downgradeWorkspace("past_due")      │
                           │    (also starts vault grace if over)   │
                           └──────────────────────────────────────┘
```

`downgradeWorkspace`:
- Resets the workspace to the Starter plan (no period_end, no transaction id, AI tokens reset)
- If `vault_size_used_bytes > Starter.max_vault_size_mb`, sets `storage_violation_at = now` immediately so the 30-day vault countdown starts predictably (instead of waiting for the next vault cron pass)
- Sends two notifications: workspace downgraded **and** "vault is over limit" (only if it actually is)
- Sends a downgrade email

**Tested in:** `apps/api/modules/mayar/billing-lifecycle.service.test.ts`

### Cancel / resume

`MayarService.cancelSubscription(workspaceId, userId)`:
- Validates `plan_status` is not `free` or already `cancelled`
- Sets `plan_status: "cancelled"`. The plan stays active until `plan_current_period_end` (the lifecycle service downgrades after that)
- Writes an audit log
- Returns the `cancels_at` date

`MayarService.resumeSubscription(workspaceId, userId)`:
- Only allowed while `plan_status === "cancelled"` **and** `plan_current_period_end > now`
- Sets `plan_status: "active"`. The next renewal cycle bills normally

There is **no immediate refund** — Mayar's one-shot invoice model doesn't expose a refund primitive from our integration. Users keep access through the paid period.

### Scheduled plan switch (upgrade/downgrade at renewal)

`MayarService.schedulePlanSwitch(workspaceId, userId, planId, billing)`:
- Persists `pending_plan_id` + `pending_plan_billing_interval`
- The lifecycle service applies the switch at `plan_current_period_end`: swaps `plan_id`, clears the pending fields, marks `past_due` (so a fresh checkout is required for the new plan). The user gets the standard past-due reminders pointing at the new plan's price
- Mayar's one-shot model means we can't auto-charge at renewal. Users must complete a new checkout to reactivate

`MayarService.cancelPendingPlanSwitch(workspaceId, userId)`:
- Clears the pending fields. User stays on their current plan and renews normally

This is **preferable to immediate plan switching** because Mayar has no proration: paying for Business mid-cycle while still holding paid Pro time would waste money. The scheduled-switch flow lets users keep their paid time intact and only pay for the new plan once the current period naturally ends.

### Webhook event processing

`MayarService.asyncProcessEvent()`:

| Event                                  | Action                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `payment.received` / `purchase` (paid) | Activate subscription or addon. Update workspace plan fields. **Issue an internal billing invoice.** |
| `payment.failed`                       | Mark order failed, notify owner, send payment-failed email                                        |
| `testing`                              | Acknowledge and return immediately                                                                |

Idempotency:
- `MayarRepository.tryClaimEvent(event.data.id)` — the first caller to insert the event id wins; concurrent webhook retries are skipped
- `BillingInvoicesService.issue()` — returns the existing invoice if one is already linked to the same `mayar_transaction_id`

### Billing invoice issuance

Triggered inline from the `payment.received` handler for both subscription and addon flows. Invoice numbering uses a per-workspace sequence allocated under a row-level lock (`SELECT FOR UPDATE`) so concurrent webhooks can't produce duplicates:

```
INV-{YEAR}-{SEQUENCE.padStart(5, '0')}
INV-2026-00001
INV-2026-00002
...
```

The internal invoice carries a snapshot of line items, billing email and workspace name at issue time so it stays valid even if the workspace is later renamed or the customer email changes.

### Checkout flow

1. Client calls `POST /v1/mayar/checkout` with `priceId` and `billing`
2. API resolves the plan, derives the amount, and calls Mayar `/invoice/create` with `extraData = { workspaceId, planId, billing, type, addonId?, qty?, locale? }`
3. Returns the Mayar payment URL
4. User completes payment on Mayar's hosted page
5. Mayar fires `payment.received` webhook → activates the subscription/addon and issues the billing invoice

### Vault downgrade behaviour

When a workspace drops to a plan with lower vault quota (typical scenario: Personal 2 GB → Starter 250 MB while holding 1.5 GB):

| Phase | Day | What happens                                                                                                  |
| ----- | --- | ------------------------------------------------------------------------------------------------------------- |
| 1     | 0   | `downgradeWorkspace` sets `storage_violation_at = now` (if over), sends two notifications. Files stay visible. |
| 2     | 30  | `processStorageViolations` cron marks all files **inactive** — hidden in UI but R2 blobs preserved             |
| 3     | 90  | `hardDeleteExtendedInactiveFiles` cron permanently deletes R2 blobs, soft-deletes rows, recomputes usage       |

At any time in phase 1 or 2, freeing space or upgrading clears `storage_violation_at` and reactivates files automatically. Both crons are run by `apps/api/scripts/storage-worker.ts`.

### Period calculation

`billing.utils.ts` provides:

- `calculatePeriodEnd(startDate, interval)` — adds 1 month or 1 year
- `inferBillingInterval(mayarProductId)` — determines `monthly` | `annual` from Mayar product metadata

### Cache invalidation

`MayarRepository.updateWorkspaceSubscription` now invalidates the workspace cache (`oewang:workspace:${workspaceId}`) and emits a `workspace` realtime event so every open tab refetches without polling. Without this, the user wouldn't see "Cancelling" or "Plan change scheduled" until the 1-hour TanStack stale window expired. (Realtime invalidation is configured in `apps/app/hooks/use-realtime.ts` — see [REALTIME.md](./REALTIME.md).)

---

## Frontend flows

### `settings/billing` — main billing page

Hero card shows:
- Plan name + status badge (`Active` / `Cancelling` / `Past Due`)
- `Renews on` or `Ends on` from `plan_current_period_end`
- Action buttons that change based on `plan_status`:
  - `active` + paid: **Manage Subscription** (magic link) · **Change Plan** · **Cancel**
  - `cancelled`: **Resume Subscription** · **Change Plan**
  - `free`: **View Plans**

Pending plan switch banner appears above the hero whenever `pending_plan_id` is set, with an **Undo** button.

A "View all invoices →" link in the history section opens the new invoice list page.

### `settings/billing/invoices` and `.../[id]`

- List page: every internal `billing_invoices` row, with View buttons
- Detail page: full invoice layout with `From`, `Billed to`, period, line items, totals, footer. The **Print / Save PDF** button uses the browser's native print dialog (no server-side PDF generation needed)

### `upgrade` — plan selection page

Each plan card has the existing checkout CTA. **When the user has an active paid plan and the card is for a different paid plan**, a secondary ghost button appears: **Switch at next renewal**. Clicking it calls `schedulePlanSwitch` directly (no checkout) and the user sees the banner on the billing page.

---

## Source files

| Layer      | File                                                                                  |
| ---------- | ------------------------------------------------------------------------------------- |
| Schema     | `packages/database/schema/pricing.ts`                                                 |
| Schema     | `packages/database/schema/workspace-addons.ts`                                        |
| Schema     | `packages/database/schema/orders.ts`                                                  |
| Schema     | `packages/database/schema/workspaces.ts` (plan + pending fields, storage_violation_at) |
| Schema     | `packages/database/schema/billing-invoices.ts`                                         |
| Types      | `packages/types/workspace.ts`                                                          |
| Types      | `packages/types/billing-invoice.ts`                                                    |
| Controller | `apps/api/modules/mayar/mayar.controller.ts`                                           |
| Controller | `apps/api/modules/mayar/billing-invoices.controller.ts`                                |
| Controller | `apps/api/modules/pricing/pricing.controller.ts`                                       |
| Controller | `apps/api/modules/pricing/public-pricing.controller.ts`                                |
| Service    | `apps/api/modules/mayar/mayar.service.ts`                                              |
| Service    | `apps/api/modules/mayar/billing-lifecycle.service.ts`                                  |
| Service    | `apps/api/modules/mayar/billing-invoices.service.ts`                                   |
| Service    | `apps/api/modules/pricing/pricing.service.ts`                                          |
| Service    | `apps/api/modules/vault/vault.service.ts` (storage violations + hard-delete)           |
| Repository | `apps/api/modules/mayar/mayar.repository.ts` (cache invalidation + realtime)           |
| Repository | `apps/api/modules/vault/vault.repository.ts`                                           |
| Utils      | `apps/api/modules/mayar/billing.utils.ts`                                              |
| Cron       | `apps/api/scripts/storage-worker.ts`                                                   |
| Actions    | `packages/modules/src/mayar/mayar.action.ts`                                           |
| Actions    | `packages/modules/src/billing-invoices/billing-invoices.action.ts`                     |
| Frontend   | `apps/app/components/organisms/setting/billing/billing-view.tsx`                       |
| Frontend   | `apps/app/components/organisms/setting/billing/print-button.tsx`                       |
| Frontend   | `apps/app/components/organisms/upgrade/upgrade-client.tsx`                             |
| Frontend   | `apps/app/app/(main)/[locale]/(dashboard)/settings/billing/`                           |
| Frontend   | `apps/app/app/(main)/[locale]/(dashboard)/settings/billing/invoices/page.tsx`          |
| Frontend   | `apps/app/app/(main)/[locale]/(dashboard)/settings/billing/invoices/[id]/page.tsx`     |
| Tests      | `apps/api/modules/mayar/billing-lifecycle.service.test.ts`                             |
| Tests      | `apps/api/modules/mayar/billing.utils.test.ts`                                         |
| E2E        | `apps/app/e2e/upgrade.spec.ts`                                                         |

---

## Known constraints

- `MAYAR_API_KEY` and `MAYAR_WEBHOOK_TOKEN` are required in production. App boots without them in dev (with warnings)
- The Mayar sandbox uses `api.mayar.club`. Production uses `api.mayar.id`. Auto-detected from the API key prefix (`sk_live_`) when `MAYAR_API_URL` is unset
- Mayar has **no subscription primitive** — every checkout creates a one-shot invoice. Renewal, cancellation, plan switching, and pro-ration are all modelled on our side
- **No automatic proration on plan switch.** Use `schedulePlanSwitch` to time changes with the renewal boundary so users don't waste paid time
- Webhook events are processed **asynchronously** (fire-and-forget via `.catch()`) — the webhook endpoint returns `200 OK` immediately. Idempotency is enforced by `MayarRepository.tryClaimEvent`
- Plan features are stored as a string array in `pricing.features` JSONB. Frontend checks membership for feature gating
- `BillingInvoicesService.issue` is idempotent only for `mayar_transaction_id`. Manually re-running a payment from Mayar's portal with a fresh transaction id would issue a second invoice — this is intentional (it represents two distinct payments)
