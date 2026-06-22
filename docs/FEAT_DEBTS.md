# Feature: Debts

> See also: [CLAUDE.md](../CLAUDE.md) · [FEAT_CONTACTS.md](./FEAT_CONTACTS.md) · [FEAT_TRANSACTIONS.md](./FEAT_TRANSACTIONS.md)

---

## 🤖 AI Agent: Update This Doc When

- Modifying `packages/database/schema/debts.ts` or `debt-payments.ts`
- Adding endpoints to `apps/api/modules/debts/debts.controller.ts`
- Changing payment logic in `apps/api/modules/debts/debts.service.ts`

---

## Purpose

Debts track money owed — either money the workspace owes to a contact (`payable`) or money a contact owes to the workspace (`receivable`). Debts can be created manually or automatically from an expense/income transaction. Payments reduce the `remainingAmount` until the debt is fully settled.

---

## Data Model

### `debts` table

| Column                | Type                     | Notes                                                     |
| --------------------- | ------------------------ | --------------------------------------------------------- |
| `id`                  | `text` (CUID2)           | Primary key                                               |
| `workspaceId`         | `text` FK → workspaces   | Required                                                  |
| `contactId`           | `text` FK → contacts     | Required — who the debt is with                           |
| `sourceTransactionId` | `text` FK → transactions | Optional — if created from a transaction                  |
| `type`                | enum                     | `payable` (workspace owes) \| `receivable` (contact owes) |
| `origin`              | enum                     | `manual` \| `from_transaction`                            |
| `amount`              | `decimal(19,4)`          | Original debt amount. Immutable after creation            |
| `remainingAmount`     | `decimal(19,4)`          | Current outstanding balance                               |
| `status`              | enum                     | `unpaid` \| `partial` \| `paid`                           |
| `description`         | `text`                   | Optional                                                  |
| `dueDate`             | `timestamp`              | Optional due date                                         |
| `createdAt`           | `timestamp`              | Auto                                                      |
| `updatedAt`           | `timestamp`              | Auto                                                      |
| `deletedAt`           | `timestamp`              | Soft delete                                               |

### `debt_payments` table

| Column        | Type                   | Notes          |
| ------------- | ---------------------- | -------------- |
| `id`          | `text` (CUID2)         | Primary key    |
| `debtId`      | `text` FK → debts      | Required       |
| `workspaceId` | `text` FK → workspaces | Required       |
| `amount`      | `decimal(19,4)`        | Payment amount |
| `date`        | `timestamp`            | Payment date   |
| `note`        | `text`                 | Optional       |
| `createdAt`   | `timestamp`            | Auto           |
| `deletedAt`   | `timestamp`            | Soft delete    |

---

## API Endpoints

Base path: `/v1/debts`

| Method   | Path                       | Role Required     | Description                                |
| -------- | -------------------------- | ----------------- | ------------------------------------------ |
| `GET`    | `/`                        | Any authenticated | List debts (paginated, filterable)         |
| `GET`    | `/:id`                     | Any authenticated | Get a single debt with payment history     |
| `POST`   | `/`                        | Editor+           | Create a manual debt                       |
| `PATCH`  | `/:id`                     | Editor+           | Update debt details (not amount/remaining) |
| `DELETE` | `/:id`                     | Editor+           | Soft-delete a debt                         |
| `POST`   | `/:id/payments`            | Editor+           | Record a payment against a debt            |
| `DELETE` | `/:id/payments/:paymentId` | Editor+           | Reverse/delete a payment                   |

**Query params for `GET /`:**

- `type` — `payable` | `receivable`
- `status` — `unpaid` | `partial` | `paid`
- `contactId`
- `startDate`, `endDate`
- `page`, `limit`

---

## Business Logic

### Status Transitions

Status is computed (not stored statically) based on `remainingAmount`:

- `remainingAmount == amount` → `unpaid`
- `0 < remainingAmount < amount` → `partial`
- `remainingAmount == 0` → `paid`

On payment creation, `remainingAmount` is decreased. Status is recalculated and updated in the same DB transaction.

### Payment Reversal

Deleting a payment (soft-delete) **reverses** the `remainingAmount` change and recalculates the debt status.

### From-Transaction Debts

When a transaction is created with `createDebt: true` in the body, `TransactionsService` creates a debt record with `origin: "from_transaction"` and `sourceTransactionId` pointing to the transaction.

### Due Date Notifications

The billing lifecycle job (cron) checks for debts with `dueDate` approaching and dispatches reminder notifications.

---

## Source Files

| Layer      | File                                                    |
| ---------- | ------------------------------------------------------- |
| Schema     | `packages/database/schema/debts.ts`                     |
| Schema     | `packages/database/schema/debt-payments.ts`             |
| Controller | `apps/api/modules/debts/debts.controller.ts`            |
| Service    | `apps/api/modules/debts/debts.service.ts`               |
| Repository | `apps/api/modules/debts/debts.repository.ts`            |
| Model      | `apps/api/modules/debts/debts.model.ts`                 |
| Utils      | `apps/api/modules/debts/debts.utils.ts`                 |
| Tests      | `apps/api/modules/debts/debts.utils.test.ts` (50 tests) |
| E2E        | `apps/app/e2e/contacts-debts.spec.ts`                   |
| Mobile     | `apps/native/lib/components/organisms/debts/debts_screen.dart` (Debt tab — position summary, All/You owe/Owed to you filter, swipe-delete, tap → record payment / edit / delete) |
| Mobile     | `apps/native/lib/components/organisms/debts/debts_form_screen.dart` (+ `_view_model`; create/edit, type + contact locked on edit, inline "New contact") |
| Mobile     | `apps/native/lib/data/repositories/debts_repository.dart` (+ remote — `list` / create / update / delete / `pay`) |
| Mobile     | `apps/native/lib/data/repositories/contacts_repository.dart` (+ remote — `list` / create, for the debt contact picker) |
| Mobile     | `apps/native/lib/domain/models/debt.dart` (`Debt`, `DebtType`, `DebtStatus`, `DebtTotals`) · `contact.dart` |
| Mobile     | Unit: `apps/native/test/unit/debt_test.dart` (wire enums, totals, overdue) |

### Mobile (apps/native)

A dedicated **Debt** tab sits between Transactions and Stats in the bottom nav. It mirrors the web feature against the same `/debts` and `/contacts` endpoints:

- **List + summary** — header shows _Owed to you_ (receivable remaining), _You owe_ (payable remaining), and _Net_; a sub-tab bar filters All / You owe / Owed to you.
- **Create/edit** — type toggle (receivable/payable, hidden on edit), contact picker (`/contacts`, with inline create), amount, optional due date, notes. Contact + type are locked on edit, matching the web.
- **Record payment** — a bottom sheet posts to `/debts/:id/pay` with an optional account; when an account is chosen the API creates the matching income/expense transaction.
- The mobile client uses the list endpoint only (no `GET /debts/:id`); amounts are `decimal` strings parsed to `num` in `DebtDto`.
