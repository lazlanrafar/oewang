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

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` (CUID2) | Primary key |
| `workspaceId` | `text` FK → workspaces | Required |
| `contactId` | `text` FK → contacts | Required — who the debt is with |
| `sourceTransactionId` | `text` FK → transactions | Optional — if created from a transaction |
| `type` | enum | `payable` (workspace owes) \| `receivable` (contact owes) |
| `origin` | enum | `manual` \| `from_transaction` |
| `amount` | `decimal(19,4)` | Original debt amount. Immutable after creation |
| `remainingAmount` | `decimal(19,4)` | Current outstanding balance |
| `status` | enum | `unpaid` \| `partial` \| `paid` |
| `description` | `text` | Optional |
| `dueDate` | `timestamp` | Optional due date |
| `createdAt` | `timestamp` | Auto |
| `updatedAt` | `timestamp` | Auto |
| `deletedAt` | `timestamp` | Soft delete |

### `debt_payments` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` (CUID2) | Primary key |
| `debtId` | `text` FK → debts | Required |
| `workspaceId` | `text` FK → workspaces | Required |
| `amount` | `decimal(19,4)` | Payment amount |
| `date` | `timestamp` | Payment date |
| `note` | `text` | Optional |
| `createdAt` | `timestamp` | Auto |
| `deletedAt` | `timestamp` | Soft delete |

---

## API Endpoints

Base path: `/v1/debts`

| Method | Path | Role Required | Description |
|--------|------|--------------|-------------|
| `GET` | `/` | Any authenticated | List debts (paginated, filterable) |
| `GET` | `/:id` | Any authenticated | Get a single debt with payment history |
| `POST` | `/` | Editor+ | Create a manual debt |
| `PATCH` | `/:id` | Editor+ | Update debt details (not amount/remaining) |
| `DELETE` | `/:id` | Editor+ | Soft-delete a debt |
| `POST` | `/:id/payments` | Editor+ | Record a payment against a debt |
| `DELETE` | `/:id/payments/:paymentId` | Editor+ | Reverse/delete a payment |

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

| Layer | File |
|-------|------|
| Schema | `packages/database/schema/debts.ts` |
| Schema | `packages/database/schema/debt-payments.ts` |
| Controller | `apps/api/modules/debts/debts.controller.ts` |
| Service | `apps/api/modules/debts/debts.service.ts` |
| Repository | `apps/api/modules/debts/debts.repository.ts` |
| Model | `apps/api/modules/debts/debts.model.ts` |
| Utils | `apps/api/modules/debts/debts.utils.ts` |
| Tests | `apps/api/modules/debts/debts.utils.test.ts` (50 tests) |
| E2E | `apps/app/e2e/contacts-debts.spec.ts` |
