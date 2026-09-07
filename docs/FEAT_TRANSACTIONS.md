# Feature: Transactions

> See also: [CLAUDE.md](../CLAUDE.md) · [FEAT_WALLETS.md](./FEAT_WALLETS.md) · [FEAT_CATEGORIES.md](./FEAT_CATEGORIES.md) · [FEAT_BUDGETS.md](./FEAT_BUDGETS.md) · [FEAT_METRICS.md](./FEAT_METRICS.md)

---

## 🤖 AI Agent: Update This Doc When

- Modifying `packages/database/schema/transactions.ts`, `transaction-items.ts`, or `transaction-attachments.ts`
- Adding/changing endpoints in `apps/api/modules/transactions/transactions.controller.ts`
- Changing wallet balance logic in `apps/api/modules/transactions/transactions.service.ts`
- Adding CSV export fields in `transactions.controller.ts`, or changing the AI import flow in `apps/worker/internal/tasks/transactions_import.go` (the `TransactionsImportService` this doc used to describe was removed — import is now fully owned by the Go worker)
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
| `POST`   | `/import` | Editor+           | Upload a bank statement image/PDF for AI extraction — enqueues onto `apps/worker`, returns `202 {jobId}` immediately |
| `GET`    | `/import/:jobId` | Any authenticated | Poll an import job's status (`pending` / `succeeded` / `failed`, plus `imported`/`skipped` counts) |
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

### AI Bank-Statement Import (async, via apps/worker)

`POST /transactions/import` (bank statement image/PDF, not a mapped CSV — that flow is the client-side CSV wizard using `POST /bulk`, see the frontend note below) creates a `transaction_import_jobs` row (`status: "pending"`) and enqueues the file (base64) onto `apps/worker`, then returns `202 {jobId}` immediately. `apps/worker`'s `TransactionsImportHandler` (`transactions_import.go`) does the rest, fully outside the request lifecycle:

1. Fetches the workspace's wallets/categories directly from Postgres.
2. Calls `apps/ai`'s `POST /import/extract` directly (not through apps/api) to OCR/parse the file into structured rows.
3. Auto-creates any category referenced by a row that doesn't already exist, inferring `income`/`expense` from the row's own type.
4. Writes each transaction sequentially (no wrapping DB transaction — a failed row is counted as `skipped`, not rolled back), atomically adjusting the matched wallet's balance and writing an audit log row per transaction.
5. Writes the final `imported`/`skipped` counts (or an error) back into the `transaction_import_jobs` row apps/api created — bounded to 2 asynq retries before being marked `failed`.

The frontend (`ImportAiModal`, `apps/app/components/organisms/transactions/transaction-import-ai-modal.tsx`) polls `GET /transactions/import/:jobId` every 2s while open until the job reaches a terminal status.

Separately, the **CSV-mapping wizard** (`transaction-import-modal.tsx`) parses the file client-side (papaparse/xlsx) and commits via the synchronous `POST /bulk` endpoint — it doesn't use the AI-import job flow above at all.

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
| Schema     | `packages/database/schema/transaction-import-jobs.ts`                 |
| Controller | `apps/api/modules/transactions/transactions.controller.ts`            |
| Service    | `apps/api/modules/transactions/transactions.service.ts`               |
| Repository | `apps/api/modules/transactions/transactions.repository.ts`            |
| Repository | `apps/api/modules/transactions/transaction-import-jobs.repository.ts` |
| Model      | `apps/api/modules/transactions/transactions.model.ts`                 |
| Utils      | `apps/api/modules/transactions/transactions.utils.ts`                 |
| Tests      | `apps/api/modules/transactions/transactions.utils.test.ts` (66 tests) |
| Sub-module | `apps/api/modules/transactions/items/transaction-items.controller.ts` |
| Sub-module | `apps/api/modules/transactions/items/transaction-items.service.ts`    |
| AI import handler (Go) | `apps/worker/internal/tasks/transactions_import.go`        |
| Postgres access (Go) | `apps/worker/internal/repo/{transactions,import_jobs}.go`    |
| Worker enqueue client | `apps/api/modules/worker/worker-client.ts`                  |
| Server action | `packages/modules/src/import/import.action.ts`                     |
| Frontend modal | `apps/app/components/organisms/transactions/transaction-import-ai-modal.tsx` |
| E2E        | `apps/app/e2e/transactions.spec.ts`, `transaction-management.spec.ts` |

---

## Mobile App (Flutter) — Transaction & Account Form UI

The `apps/native` transaction and account forms were rebuilt on a reusable, WMoney-style component system. See [BEST_PRACTICE_FLUTTER.md → Forms](./BEST_PRACTICE_FLUTTER.md#forms) for the full pattern; this is the feature-level summary.

### What it does

- **Live amount entry.** Tapping the Amount row opens a numeric keypad and the value updates in the row in real time with locale grouping and the ISO **code** (`IDR 1.000`) — the number is no longer shown only inside the keypad. The keypad shows one tab per **workspace currency** (main `IDR` + sub-currencies, read from the global `subCurrenciesProvider`), labelled by code; the tabs auto-hide when the workspace tracks only its main currency.
- **Non-modal input panels.** Date, Amount, Category and Account each open a flat, full-width panel pinned to the bottom (a split "second screen", not a floating modal). The form above stays visible and tappable, so tapping another field **swaps** the panel instead of requiring you to close it first. All panels share one fixed height and a black header.
- **Pickers.** Category and Account use a 3-column grid (categories show their emoji); the Date picker is a custom in-app calendar (Sunday-start, colored weekends, square selected day) replacing the OS dialog.
- **Daily list.** The day-grouped list renders each day as a white card on a faint gray gap. Each row's title is `category.name ?? transaction.name`; an uncategorized transaction with no name shows **no title line** (just the wallet name), not an "Uncategorized" placeholder.
- **Transfer.** The Transfer tab has no inline "Fees" button next to the Amount, and From/To are separated only by each field's own underline (no extra divider).

### Currency note

The keypad currency tabs are populated from the workspace's currencies (`subCurrenciesProvider`), but selecting one still only changes the **displayed** code locally — the choice is not yet persisted onto the transaction (storage defaults to the `IDR` main currency). To persist it, thread `onCurrencyChanged`/`currency` from `Input(context: currency)` into the form ViewModel and the `NewTransactionDraft`.

### Mobile Source Files

| Concern                 | File                                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| Transaction form        | `apps/native/lib/components/organisms/transactions/transactions_form_screen.dart` |
| Account form            | `apps/native/lib/components/organisms/wallets/wallets_account_form_screen.dart` |
| Form ViewModel          | `apps/native/lib/components/organisms/transactions/transactions_form_view_model.dart` |
| Reusable fields + panels | `apps/native/lib/components/atoms/inputs/` — the one `Input` system: `contexts/` (render + opener + sheet per context), `bases/` (`FormDrawerHost`, `FormFieldRow`, drawer header/metrics) |
| Amount formatting       | `apps/native/lib/core/format/amount_format.dart`                           |
| Daily list cards        | `apps/native/lib/components/organisms/transactions/transactions_daily_screen.dart`, `transactions_daily_group_header.dart` |

---

## Known Constraints & Edge Cases

- `amount` is always positive in storage. Sign (income/expense/transfer direction) is determined by `type`.
- `toWalletId` must be different from `walletId` for transfers — validate in service.
- Deleting a transaction reverses the balance change, but does NOT cascade-delete attachments from the vault.
- AI bank-statement import does not update existing transactions — it only inserts new ones, sequentially with no wrapping DB transaction; a row that fails to insert (unresolvable wallet, DB error) is counted as `skipped`, not retried within the same job.
- `isExported` is a tracking flag — it is set to `true` when the transaction appears in a CSV export.
