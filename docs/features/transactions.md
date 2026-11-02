# Feature: Transactions

Status: draft v0.1, 2026-11-02. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md) TXN-1 to TXN-15, WAL, CAT and VLT requirements.

Transactions are the product. Every movement of money is one row: income, expense, or a transfer between wallets. Creating one moves wallet balances. A transaction can carry line items and file attachments.

## Update this doc when

- Changing the transaction service, in particular the balance arithmetic.
- Adding or changing a transaction route. The catalog lives in [endpoints](../api/endpoints.md#transactions).
- Changing a transaction screen, a filter, or a column in the table.
- Changing the CSV export columns or the import wizard steps.

## Data

Tables, columns and indexes are in [data model](../data-model.md#ledger): `transactions`, `transaction_items`, `transaction_attachments`, `transaction_import_jobs`, plus `wallets`, `wallet_groups`, `categories` and `vault_files`.

## Multicurrency

A wallet has its own currency, **defaulting to the workspace currency** (WAL-5, D37). A workspace that never adds a foreign wallet never meets any of this. Full rules and worked examples in [data model](../data-model.md#multicurrency).

What it means in practice:

- A USD wallet shows a USD balance that matches its own statement. Totals and charts still render in the workspace currency.
- A transaction may also be entered in a currency other than its wallet's. It converts once, at entry, and the entered amount plus the rate are kept on the row (TXN-20).
- The rate prefills from a daily source and stays editable, because a bank's rate is not the market rate (D39). The rate used is stored, so a historical report does not move when today's rate does.
- The list shows the wallet-currency amount as the primary figure, with the original beside it when the entry differed (TXN-21).
- A cross-currency transfer moves two different figures: `amount` leaves the source, `to_amount` arrives in the destination (TXN-18).
- Every row stores `base_amount` in the workspace currency, so a summary is a plain sum with no conversion at read time (TXN-19).
- A wallet's currency is locked once it has live transactions, and the workspace currency once any transaction exists (WAL-6). Changing either would silently reinterpret numbers already written.
- A write never fails because the rate source is down. The rate resolves same, then request, then live, then newest cache, and only returns an error when no cached rate has ever existed for the pair (TXN-22, D43). A row written on a stale rate is marked, with the rate and its date visible.

## Business rules

### Balance arithmetic

The full rules are in [data model](../data-model.md#balance-arithmetic). In short:

| Event | Effect |
|---|---|
| Create `expense` | source wallet balance decreases |
| Create `income` | source wallet balance increases |
| Create `transfer` | source decreases by `amount`, destination increases by `to_amount` |
| Update | reverse the old effect, apply the new one |
| Delete | reverse the effect |

All of it inside one database transaction, with the affected wallet rows locked in ascending ID order (TXN-6, D13).

### Validation

| Rule | Error code |
|---|---|
| `amount` greater than zero | `AMOUNT_NOT_POSITIVE` |
| `transfer` has a `to_wallet_id` | `TRANSFER_REQUIRES_DESTINATION` |
| `to_wallet_id` differs from `wallet_id` | `TRANSFER_SAME_WALLET` |
| `to_wallet_id` null for non-transfers | `DESTINATION_NOT_ALLOWED` |
| `to_amount` present and positive for a transfer, null otherwise | `TRANSFER_AMOUNT_REQUIRED` |
| `original_amount`, `original_currency_code` and `exchange_rate` are all set or all null | `VALIDATION_FAILED` |
| A foreign entry's currency differs from the source wallet's | `VALIDATION_FAILED` |
| Both wallets live and in this workspace | `WALLET_NOT_FOUND` |
| Category, if given, live and in this workspace | `CATEGORY_NOT_FOUND` |

### Audit

Every create, update and delete writes an `audit_logs` row inside the same database transaction (OPS-1, D14), with `before` and `after` snapshots and a `source` of `web`, `chat`, `import` or `receipt`.

### What is not here

The old app ran a budget check after every expense and dispatched a notification when a category budget was exceeded. Budgets are out of scope, so that path does not exist. The old app also called a realtime service to invalidate other clients; there is no realtime channel here, and a client refetches after its own mutation.

## API

Route tables are in [endpoints](../api/endpoints.md#transactions). The shape of the work:

| Group | Routes |
|---|---|
| List and read | `GET /v1/transactions`, `GET /v1/transactions/{id}`, `GET /v1/transactions/summary` |
| Write | `POST`, `PATCH /v1/transactions/{id}`, `DELETE /v1/transactions/{id}` |
| Bulk | `POST /v1/transactions/bulk`, `/bulk-update`, `/bulk-delete` |
| Export and import | `GET /v1/transactions/export`, `POST /v1/transactions/import`, `GET /v1/transactions/import/{job_id}` |
| Line items | `GET`, `POST`, `PUT`, `DELETE` under `/v1/transactions/{id}/items` |

List responses include wallet and category names, joined in the same query. An N+1 per row is a performance bug, and the 10,000 row target in [success metrics](../prd.md#7-success-metrics) will catch it.

## Screens

### Transaction list

The main screen. One page, `/transactions`.

| Area | Contents |
|---|---|
| Header | Title, date range picker, grouping selector, export button, import button, add button |
| Filter bar | Search, wallet, category, type, ready flag, clear-all |
| Table | Date, name, category, wallet, amount, ready flag, row actions |
| Bulk bar | Appears on selection: change category, toggle ready, delete, clear selection |
| Empty state | Different copy for "no transactions yet" and "no results for these filters" |

Filter state lives in URL search parameters, so a shared link reproduces the view (TXN-9). Column visibility and density persist in local storage, which is a per-browser convenience, not state the server needs.

Amounts render right-aligned, with expenses in the foreground colour and income in the positive accent, carried over from the old design.

### Transaction form sheet

A side sheet, used for both create and edit.

- Type toggle first: income, expense, transfer. Switching it changes which fields are visible. Transfer reveals the destination wallet and hides the category.
- Amount input is decimal-safe: the value is held as a string, never parsed into a JavaScript number (D12).
- Date defaults to today. Wallet defaults to the workspace default wallet (WAL-3).
- Optional: name, category, description, ready flag, line items, attachments.
- Attachments upload immediately on drop, so the sheet submits only IDs.

On success the sheet closes, the list invalidates, and a toast confirms.

### Transaction detail sheet

Read-first view of one transaction: all fields, line items, attachments with thumbnails, and its audit history.

The history section answers "why is this number what it is" at the row the user is looking at (OPS-8, D46). Each entry names the actor, the surface (`web`, `chat`, `import`, `receipt`) and what changed:

```
Riwayat
  2 Nov 14:02   Azlan · chat      amount 50.000 -> 87.500
  2 Nov 13:55   Azlan · receipt   created
```

It matters most for writes the assistant made, which is the case where a user is least able to reconstruct what happened. Edit and delete are visible to `admin+` and hidden for `member`. Delete asks for confirmation (UI-4).

### Import

Two paths, picked by what the file is. The rule behind the split: **deterministic beats model-driven whenever structure exists.**

| File | Path | What the model does |
|---|---|---|
| CSV, XLSX | Column mapping wizard | Maps column names once. Never sees a row |
| Image, PDF | Asynchronous extraction | Reads the rows, because there are no columns to map |

#### CSV and spreadsheet (TXN-11, D28)

Four steps, ported from the old wizard, with one change: step 2 arrives prefilled.

1. **Select file.** Drop a CSV or XLSX. Parsed in the browser.
2. **Map fields.** The column names and two sample rows go to the AI service, which returns a proposed mapping ([column mapping](../ai/service.md#csv-column-mapping)). The user confirms or corrects it. A failed or slow mapping call leaves the step empty and the user maps by hand; the wizard never blocks on it.
3. **Map values.** Match the file's category and wallet names to existing rows, or create new ones.
4. **Review and commit.** Shows what will be created, what is a duplicate, and what will be skipped. Commits through `POST /v1/transactions/bulk`.

Every row is transformed in code. The model never sees an amount and cannot move a decimal point. One small call per file, whatever the row count.

Indonesian bank exports usually split debit and credit into two columns. That is a mapping fact, handled once in step 2, with the sign rule in code.

#### Image and PDF statement (AI-4)

1. Upload. The API returns `202 {job_id}` immediately.
2. Extraction runs the [quality ladder](../ai/service.md#extraction-quality-ladder): a cheap model first, escalating only when the result scores poorly (D36).
3. The modal polls `GET /v1/transactions/import/{job_id}` every 2 seconds.
4. On success it shows the imported, skipped and duplicate counts, and a review list with low confidence rows flagged.

Because this path is asynchronous, the ladder's wall-clock budget is looser here than for a receipt the user is watching. The budget is per document either way.

#### Deduplication (TXN-16, D29)

Both paths compute a content fingerprint per row and store it ([data model](../data-model.md#import-fingerprint)). A row whose fingerprint already exists in the workspace is counted as a duplicate and skipped, enforced by a unique index rather than by a dialog.

So re-uploading last month's statement imports only the rows that are new. The user never has to remember what they already imported, and a partially failed import is safe to retry whole.

#### Failure handling

- A row-level error is shown and skipped. One bad row never fails a file.
- A job `pending` for more than 10 minutes is treated as stale: the modal offers a retry instead of spinning forever (D12 in [research](../research/midday.md#34-the-document-path-a-quality-ladder-not-one-big-call), P12).
- A failed job keeps the uploaded file, so a retry does not re-upload.
- Validation is a filter, not a gate: valid rows are committed, invalid rows are returned with their reason.

#### Foreign currency rows (TXN-23, D45)

A statement can cover months, so one rate for the whole file would be wrong for most of it. Each row converts with the rate for **its own date**:

1. Row currency equals the wallet currency: no conversion.
2. Otherwise look up the cached rate for that row's date.
3. No rate for that date: the row is skipped and reported, like any other row-level failure. The file still imports.

The review step reports skipped-for-missing-rate separately from skipped-for-invalid, because the fix is different: one needs a rate backfill, the other needs the file corrected.

### Export

A modal picks a date range and confirms the active filters, then downloads a CSV from `GET /v1/transactions/export`. Exported rows are marked `is_exported = true` (TXN-10). Amounts in the CSV are unformatted decimals, not display strings.

## Measured reference

The live app at `app.oewang.com` is newer than the snapshot in
`references/oewang-old`, so it is the reference for anything visual. These
values were measured there on 2026-11-02, not estimated from a screenshot.

| | Value |
|---|---|
| Root font size | 15px |
| Body font | Hedvig Letters Sans; the serif at 400, never bold |
| Border radius, every primitive | 0 |
| Button and input height | 33.75px (`h-9`) |
| Table header row | 45px (`h-12`), text `#666666`, `font-medium`, vertical rule between columns |
| Table cell | `px-4`, `text-sm` |
| Sidebar | 240px, the rule on the outer wrapper, inner panel `bg-sidebar/70` with a blur |
| Header | 45px (`h-12`), translucent, bottom rule |
| Nav item | `h-9`, `px-2`, `gap-2`, `text-sm`, square, active background `sidebar-accent` |
| Group label | `text-xs`, `font-medium`, `foreground/70`, `px-2` |
| Type scale in use | 13.125px (`text-sm`, dominant), 16.875px (`text-lg`), 11.25px (`text-xs`), 10px |
| `h2` / `h4` / `p` | 16.875px 500 ls -0.42px / 11.25px 600 `#616161` / 11.25px `#616161` |
| Label | 13.125px, `font-medium`, `leading-none` |
| Input | `h-9`, `px-3`, 1px `rgb(219,218,215)`, radius 0, and **no outline when focused** |
| Select trigger | `h-9`, `px-3`, 1px `rgb(228,228,231)`, radius 0 |
| Menu surface | `rgb(247,246,243)`, 1px rule, radius 0, no shadow |
| Menu item | 30px tall, `px-2`, `py-1.5`; live radius 3.5px, squared here (D52) |
| Checkbox | 15px square, 1px border, radius 0 |
| In-cell editor | a `button` with `aria-haspopup="dialog"`, `h-9`, borderless |
| Data row | 45px; the rule is `border-bottom` **on the cell**, not the row; no hover state |
| Day group row | 40px, `rgb(251,251,250)`, with a chevron |
| Radius scale | Live: `--radius: .5rem`, so `sm` 3.5px, `md` 5.5px, `lg` 7.5px, applied only to menu items. **This rewrite zeroes the whole scale and squares menu items too (D52).** |

Every row above is reproduced and re-measured by the development-only
[design system page](../best-practices/svelte-app.md#the-design-system-page)
at `/design-system`.

The transaction table there carries more than this rewrite has built yet. US-017
should match it:

- **Rows are grouped by day.** Each group has a header row with the date and
  that day's income and expense totals on the right.
- A selection checkbox column, then date, description, amount, account,
  category, and a row-actions column.
- **The whole amount is coloured**, red for an expense and green for income,
  with the sign as well so colour is never the only carrier (UI-7).
- Category shows a coloured square plus its name; account shows an icon.
- Account and category are editable in place from the row, each opening its picker inside the cell.
- **Columns resize and stick** (D60). Every data column has a 4px handle on its right edge: drag to widen, double click to reset. Select, date and description stick to the left at offsets 0, 50 and 160; actions sticks to the right. The rest scroll under them.
- Measured column widths: select 50, date 110, description 320, amount 170, account 200, category 161, actions 100. Every cell carries a rule on its right as well as under it, except the last.
- Above the table: search with a filter control, a grouping selector, a date
  range picker, a column-visibility control, an export menu and an add button.

## UI port map

Each new component has a reference file in the old app. "Port" means reproduce the layout, the states and the interactions, in idiomatic Svelte 5. It does not mean transliterate React.

| New component | Old reference | Old size |
|---|---|---|
| `transactions/transaction-table.svelte` | `transaction-client.tsx` | 865 lines |
| `transactions/transaction-columns.ts` | `transaction-columns.tsx` | 567 lines |
| `transactions/transaction-header.svelte` | `transaction-client-header.tsx` | 165 lines |
| `transactions/transaction-form-sheet.svelte` | `transaction-form-sheet.tsx` | 907 lines |
| `transactions/transaction-detail-sheet.svelte` | `transaction-detail-sheet.tsx` | 611 lines |
| `transactions/bulk-edit-bar.svelte` | `transaction-bulk-edit-bar.tsx` | 124 lines |
| `transactions/export-modal.svelte` | `transaction-export-modal.tsx` | 173 lines |
| `transactions/import-wizard/*.svelte` | `transaction-import-modal.tsx` plus the four mapping components | 1,435 lines |
| `transactions/import-ai-modal.svelte` | `transaction-import-ai-modal.tsx`, `transaction-import-ai-review.tsx` | 371 lines |
| `transactions/receipt-confirmation-sheet.svelte` | `transaction-receipt-confirmation-modal.tsx` | 219 lines |
| `transactions/grouping-selector.svelte` | `transaction-grouping-selector.tsx` | 32 lines |

Old files are at `references/oewang-old/apps/app/components/organisms/transactions/`.

The old components carry weight that does not come along: budget warnings, realtime invalidation, quota gates, multi-locale strings. Target roughly half the line count per component. If a port comes out larger than its reference, something was copied that should have been dropped.

## Performance

| Operation | Target |
|---|---|
| List page 1, 10,000 row workspace | under 100 ms server-side |
| Create | under 50 ms |
| Bulk update, 100 rows | under 500 ms |
| CSV export, 10,000 rows | streamed, first byte under 1 second |

The covering index on `(workspace_id, date DESC, created_at DESC) WHERE deleted_at IS NULL` is what makes the list target reachable. Any new sort option needs its own index or it will not hold.

## Testing

| Layer | Coverage |
|---|---|
| Unit (Rust) | Balance arithmetic for all three types, all nine update transitions, delete reversal, every validation rule |
| Concurrency (Rust) | Two parallel creates against one wallet produce the correct final balance |
| Integration (Rust) | List filters, pagination, CSV export shape, bulk operations |
| End to end (Playwright) | Create a transaction through the form sheet and see it in the list with the correct balance |

## Related docs

- [Docs index](../README.md) and [PRD](../prd.md)
- [Data model](../data-model.md#ledger) and [balance arithmetic](../data-model.md#balance-arithmetic)
- [API endpoints](../api/endpoints.md#transactions) and [conventions](../api/conventions.md)
- [Auth and access control](../security/auth.md#permission-matrix)
- [Chat](chat.md) (the assistant writes through the same service)
- [Svelte app best practices](../best-practices/svelte-app.md)
- [Legacy app](../reference/legacy-app.md#where-to-look-when-porting)
