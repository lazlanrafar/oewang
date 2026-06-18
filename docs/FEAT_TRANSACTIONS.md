# Feature: Transactions

> See also: [CLAUDE.md](../CLAUDE.md) · [FEAT_WALLETS.md](./FEAT_WALLETS.md) · [FEAT_CATEGORIES.md](./FEAT_CATEGORIES.md) · [FEAT_BUDGETS.md](./FEAT_BUDGETS.md) · [FEAT_METRICS.md](./FEAT_METRICS.md)

---

## 🤖 AI Agent: Update This Doc When

- Modifying `packages/database/schema/transactions.ts`, `transaction-items.ts`, or `transaction-attachments.ts`
- Adding/changing endpoints in `apps/api/modules/transactions/transactions.controller.ts`
- Changing wallet balance logic in `apps/api/modules/transactions/transactions.service.ts`
- Adding CSV export fields or import parsing in `transactions.import.service.ts`
- Changing the **mobile** transaction/account form or its input panels in `apps/native/lib/components/atoms/` & `lib/components/molecules/` (shared form fields/sheets) or `apps/native/lib/components/organisms/transactions/`

---

## Purpose

Transactions are the core financial records of oewang. Every movement of money (income, expense, or transfer between wallets) is a transaction. Creating a transaction automatically updates the associated wallet balances. Transactions can have line items (for receipts), attachments (images/PDFs), and be imported via CSV.

---

## Data Model

### `transactions` table

| Column           | Type                   | Notes                                             |
| ---------------- | ---------------------- | ------------------------------------------------- |
| `id`             | `text` (CUID2)         | Primary key                                       |
| `workspaceId`    | `text` FK → workspaces | Required                                          |
| `walletId`       | `text` FK → wallets    | Source wallet. Required                           |
| `toWalletId`     | `text` FK → wallets    | Destination wallet. Only for `transfer` type      |
| `categoryId`     | `text` FK → categories | Optional                                          |
| `assignedUserId` | `text` FK → users      | Defaults to creator                               |
| `amount`         | `decimal(19,4)`        | Always positive. Required                         |
| `date`           | `timestamp`            | Transaction date. Required                        |
| `type`           | `text` enum            | `income` \| `expense` \| `transfer`               |
| `description`    | `text`                 | Optional free-text note                           |
| `name`           | `text`                 | Optional label/payee                              |
| `isReady`        | `boolean`              | Reviewed/confirmed flag. Default `false`          |
| `isExported`     | `boolean`              | Whether included in a CSV export. Default `false` |
| `createdAt`      | `timestamp`            | Auto                                              |
| `updatedAt`      | `timestamp`            | Auto                                              |
| `deletedAt`      | `timestamp`            | Soft delete                                       |

### `transaction_items` table (line items for receipts)

| Column                                  | Type                     | Notes                      |
| --------------------------------------- | ------------------------ | -------------------------- |
| `id`                                    | `text` (CUID2)           | Primary key                |
| `transactionId`                         | `text` FK → transactions | Required                   |
| `workspaceId`                           | `text` FK → workspaces   | Required                   |
| `name`                                  | `text`                   | Item name                  |
| `brand`                                 | `text`                   | Optional                   |
| `quantity`                              | `decimal`                | Optional                   |
| `unit`                                  | `text`                   | Optional (kg, pcs, etc.)   |
| `unitPrice`                             | `decimal`                | Optional                   |
| `amount`                                | `decimal`                | Item total                 |
| `categoryId`                            | `text` FK → categories   | Optional per-item category |
| `createdAt` / `updatedAt` / `deletedAt` | `timestamp`              | Standard                   |

### `transaction_attachments` table

| Column          | Type                     | Notes                    |
| --------------- | ------------------------ | ------------------------ |
| `id`            | `text` (CUID2)           | Primary key              |
| `transactionId` | `text` FK → transactions | Required                 |
| `workspaceId`   | `text` FK → workspaces   | Required                 |
| `vaultFileId`   | `text` FK → vault_files  | Points to the vault file |
| `createdAt`     | `timestamp`              | Auto                     |

---

## API Endpoints

Base path: `/v1/transactions`

| Method   | Path      | Role Required     | Description                                   |
| -------- | --------- | ----------------- | --------------------------------------------- |
| `GET`    | `/`       | Any authenticated | List transactions (paginated)                 |
| `GET`    | `/export` | Any authenticated | Export as CSV download                        |
| `POST`   | `/`       | Editor+           | Create a transaction (updates wallet balance) |
| `POST`   | `/bulk`   | Editor+           | Create multiple transactions at once          |
| `POST`   | `/import` | Editor+           | Import transactions from CSV                  |
| `GET`    | `/:id`    | Any authenticated | Get single transaction                        |
| `PATCH`  | `/:id`    | Editor+           | Update transaction fields                     |
| `DELETE` | `/:id`    | Editor+           | Soft-delete; reverses wallet balance change   |

### Transaction Items (sub-module)

Base path: `/v1/transactions/:transactionId/items`

| Method   | Path       | Role Required     | Description                       |
| -------- | ---------- | ----------------- | --------------------------------- |
| `GET`    | `/`        | Any authenticated | List line items for a transaction |
| `POST`   | `/`        | Editor+           | Add a line item                   |
| `PUT`    | `/:itemId` | Editor+           | Update a line item                |
| `DELETE` | `/:itemId` | Editor+           | Remove a line item                |

**Key query params for `GET /`:**

- `walletId` — filter by source wallet
- `categoryId` — filter by category
- `type` — `income` | `expense` | `transfer`
- `startDate`, `endDate` — ISO date range
- `search` — matches `name` or `description`
- `isReady` — filter by ready flag
- `page`, `limit`

---

## Business Logic

### Balance Update Rules

When a transaction is **created**:

- `expense` → `walletId.balance -= amount`
- `income` → `walletId.balance += amount`
- `transfer` → `walletId.balance -= amount` AND `toWalletId.balance += amount`

When a transaction is **deleted**:

- The balance change is **reversed** (opposite direction)

When a transaction is **updated** (type or amount changed):

- Old balance effect is reversed, new balance effect is applied

### Budget Exceeded Notification

After creating an `expense` transaction with a `categoryId`, the service checks if a budget exists for that category for the current month. If the accumulated expenses exceed the budget amount, a notification is dispatched to the workspace.

### CSV Import

`TransactionsImportService` parses the uploaded CSV, validates columns, and bulk-inserts transactions. Supported columns include `date`, `amount`, `type`, `description`, `walletId`, `categoryId`. The import returns a summary of `inserted`, `skipped`, and `errors`.

### Attachments

Attachments link vault files to transactions. When creating a transaction, pass `attachmentIds: string[]` containing vault file IDs. The service calls `TransactionsRepository.syncAttachments()` to create `transaction_attachments` rows.

### Audit & Realtime

Every mutation calls `AuditLogsService.log()`. Every mutation triggers `NotificationsService.create()` with type `transaction.created`. Every mutation triggers `RealtimeService.notifyValueChange(workspaceId, "transactions")`.

---

## Source Files

| Layer      | File                                                                  |
| ---------- | --------------------------------------------------------------------- |
| Schema     | `packages/database/schema/transactions.ts`                            |
| Schema     | `packages/database/schema/transaction-items.ts`                       |
| Schema     | `packages/database/schema/transaction-attachments.ts`                 |
| Controller | `apps/api/modules/transactions/transactions.controller.ts`            |
| Service    | `apps/api/modules/transactions/transactions.service.ts`               |
| Service    | `apps/api/modules/transactions/transactions.import.service.ts`        |
| Repository | `apps/api/modules/transactions/transactions.repository.ts`            |
| Model      | `apps/api/modules/transactions/transactions.model.ts`                 |
| Utils      | `apps/api/modules/transactions/transactions.utils.ts`                 |
| Tests      | `apps/api/modules/transactions/transactions.utils.test.ts` (66 tests) |
| Sub-module | `apps/api/modules/transactions/items/transaction-items.controller.ts` |
| Sub-module | `apps/api/modules/transactions/items/transaction-items.service.ts`    |
| E2E        | `apps/app/e2e/transactions.spec.ts`, `transaction-management.spec.ts` |

---

## Mobile App (Flutter) — Transaction & Account Form UI

The `apps/native` transaction and account forms were rebuilt on a reusable, WMoney-style component system. See [BEST_PRACTICE_FLUTTER.md → Forms](./BEST_PRACTICE_FLUTTER.md#forms) for the full pattern; this is the feature-level summary.

### What it does

- **Live amount entry.** Tapping the Amount row opens a numeric keypad and the value updates in the row in real time with locale grouping (`Rp 1.000.000`) — the number is no longer shown only inside the keypad. `Rp / S$ / US$` tabs switch the displayed currency (`IDR`/`USD`/`SGD`).
- **Non-modal input panels.** Date, Amount, Category and Account each open a flat, full-width panel pinned to the bottom (a split "second screen", not a floating modal). The form above stays visible and tappable, so tapping another field **swaps** the panel instead of requiring you to close it first. All panels share one fixed height and a black header.
- **Pickers.** Category and Account use a 3-column grid (categories show their emoji); the Date picker is a custom in-app calendar (Sunday-start, colored weekends, square selected day) replacing the OS dialog.
- **Daily list.** The day-grouped list renders each day as a white card on a faint gray gap.

### Currency note

The keypad currency tabs currently change only the **displayed** symbol locally; the selected currency is not yet persisted onto the transaction (storage still defaults to `IDR`). To persist it, thread `onCurrencyChanged`/`currency` from `AmountInputField` into the form ViewModel and the `NewTransactionDraft`, and wire it to the Main Currency Setting once that setting is backed by a provider.

### Mobile Source Files

| Concern                 | File                                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| Transaction form        | `apps/native/lib/components/organisms/transactions/transactions_form_screen.dart` |
| Account form            | `apps/native/lib/components/organisms/wallets/wallets_account_form_screen.dart` |
| Form ViewModel          | `apps/native/lib/components/organisms/transactions/transactions_form_view_model.dart` |
| Reusable fields + panels | `apps/native/lib/components/atoms/` (field rows, `drawer_*`) & `lib/components/molecules/` (pickers, `form_drawer`/`FormDrawerHost`) |
| Amount formatting       | `apps/native/lib/core/format/amount_format.dart`                           |
| Daily list cards        | `apps/native/lib/components/organisms/transactions/transactions_daily_screen.dart`, `transactions_daily_group_header.dart` |

---

## Known Constraints & Edge Cases

- `amount` is always positive in storage. Sign (income/expense/transfer direction) is determined by `type`.
- `toWalletId` must be different from `walletId` for transfers — validate in service.
- Deleting a transaction reverses the balance change, but does NOT cascade-delete attachments from the vault.
- CSV import does not update existing transactions — it only inserts new ones. Duplicates are skipped.
- `isExported` is a tracking flag — it is set to `true` when the transaction appears in a CSV export.
