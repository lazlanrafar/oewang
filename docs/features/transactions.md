# Feature: Transactions

Status: draft v0.1, 2026-11-02. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md) TXN-1 to TXN-15, WAL, CAT and VLT requirements.

Transactions are the product. Every movement of money is one row: income, expense, or a transfer between wallets. Creating one moves wallet balances. A transaction can carry line items and file attachments.

## Update this doc when

- Changing the transaction service, in particular the balance arithmetic.
- Adding or changing a transaction route. The catalog lives in [endpoints](../api/endpoints.md#transactions).
- Changing a transaction screen, a filter, or a column in the table.
- Changing the CSV export columns, the import wizard steps, or the statement import job.
- Changing the receipt confirmation sheet or what it writes.
- Changing how attachments are shown, picked or saved. The file sheet itself is in [vault](vault.md).

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
| Header | Title, date range picker, grouping selector, export button, scan-a-receipt button, import button, add button |
| Filter bar | Search, wallet, category, type, clear-all |
| Table | Date, name, category, wallet, amount, row actions |
| Bulk bar | Appears on selection: change category, toggle ready, delete, clear selection |
| Empty state | Different copy for "no transactions yet" and "no results for these filters" |

Filter state lives in URL search parameters, so a shared link reproduces the view (TXN-9). Column visibility and density persist in local storage, which is a per-browser convenience, not state the server needs.

The amount range in the filter bar is a bound on the **base amount**, the workspace's own currency, not on the figure the row was entered in (D77). A list holding a USD wallet beside an IDR one has no single scale otherwise, and the filter bar and the assistant both speak in the workspace currency. Clearing the range sends `?min_amount=` rather than dropping the key, and an empty value means no bound rather than an error.

Amounts render right-aligned, with expenses in the foreground colour and income in the positive accent, carried over from the old design.

### Transaction form sheet

A side sheet, used for both create and edit.

- Type toggle first: income, expense, transfer. Switching it changes which fields are visible. Transfer reveals the destination wallet and hides the category.
- Amount input is decimal-safe: the value is held as a string, never parsed into a JavaScript number (D12).
- Date defaults to today. Wallet defaults to the workspace default wallet (WAL-3).
- Optional: name, category, description, line items, attachments.
- Attachments are the old form sheet's block (`molecules/file-dropzone`): a label, the attached files as a three-column grid of square tiles (`molecules/file-tile`), and a dashed box under them. A click on the box opens the vault picker (`molecules/file-picker`); a drop uploads straight to the vault, with a "Saving..." overlay while it runs. Either way the sheet submits only IDs (VLT-13).
- The sheet submits the whole set of attachment IDs on every save, so an edit loads the row's current attachments for `?sheet=<id>` itself. It cannot rely on the detail sheet having loaded them: opening the editor from the detail clears `?detail=`.

On success the sheet closes, the list invalidates, and a toast confirms.

### Transaction detail sheet

Read-first view of one transaction: all fields, an editable line-item table, its attachments and its audit history.

**Attachments** is an accordion section, open by default, holding the same square tiles as the form sheet. A tile shows the file's server-made preview, never the whole file ([thumbnails](vault.md#thumbnails)). A writer sees a remove button on each tile and an "Add or upload files" button that opens the vault picker. A change saves at once: the page action `?/setAttachments` re-reads the row and PATCHes it with the full attachment set, through the same `resave` helper `setWallet` uses, so the balances, the lock order and the audit row stay behind `PATCH /v1/transactions/{id}`. The set is always whole, so removing the last tile means none rather than leave them alone (TXN-13, VLT-13).

Clicking a tile opens the vault's file sheet stacked over this one, through `?file=<id>` on `/transactions` (VLT-7). It is the sheet the vault page opens, so rename, tags, linked transactions and delete behave the same here.

File bytes arrive as chunks through the SvelteKit server's `/vault/files` routes, which read them from the API inside the envelope, and are shown from an object URL that is revoked when the sheet closes. No signed object-storage URL exists anywhere in the codebase (VLT-3, D23). The proxy routes moved from `transactions/files/` to `vault/files/` with D90, because both pages use them.

Line items move no money: only the transaction's own `amount` does. When the items do not add up to it the sheet raises a badge and nothing more, because a receipt with a service charge on it legitimately does not add up (TXN-12).

Every confirmation on this screen is the design system's alert dialog rather than the browser's `confirm`. The native one blocks the renderer until it is dismissed, which freezes the page, and it cannot be translated (UI-1, UI-4).

The history section answers "why is this number what it is" at the row the user is looking at (OPS-8, D46). Each entry names the actor, the surface (`web`, `chat`, `import`, `receipt`) and what changed:

```
Riwayat
  2 Nov 14:02   Azlan · chat      amount 50.000 -> 87.500
  2 Nov 13:55   Azlan · receipt   created
```

It matters most for writes the assistant made, which is the case where a user is least able to reconstruct what happened. Edit and delete are visible to `admin+` and hidden for `member`. Delete asks for confirmation (UI-4).

### Receipt confirmation

**Scan a receipt** in the header opens the same dropzone the form sheet uses.
When the upload finishes, the [canvas](chat.md#canvas) opens over the parsed
draft at `?canvas=receipt&id={vault_file_id}`, and the page reflows beside it.
It is the same panel and the same confirmation sheet the chat page mounts,
because a receipt is confirmed the same way wherever it was dropped. The flow,
the marks on each field and what is and is not stored are in
[receipt OCR](chat.md#receipt-ocr).

### Import

Two paths, picked by what the file is. The rule behind the split: **deterministic beats model-driven whenever structure exists.**

| File | Path | What the model does |
|---|---|---|
| CSV, XLSX | Column mapping wizard | Maps column names once. Never sees a row |
| Image, PDF | Asynchronous extraction | Reads the rows, because there are no columns to map |

#### CSV and spreadsheet (TXN-11, D28)

Four steps, ported from the old wizard, with one change: step 2 arrives prefilled once the AI service can be reached. Until then it arrives empty, which is the same path a failed mapping call takes.

1. **Select file.** Drop a CSV. Parsed in the browser. XLSX is not read; see [what is not built](#data-table-what-is-built-and-what-is-not).
2. **Map fields.** The column names and two sample rows go to the AI service, which returns a proposed mapping ([column mapping](../ai/service.md#csv-column-mapping)). The user confirms or corrects it. A failed or slow mapping call leaves the step empty and the user maps by hand; the wizard never blocks on it.
3. **Map values.** Match the file's category and wallet names to existing rows, or create new ones.
4. **Review and commit.** Shows what will be created, what is a duplicate, and what will be skipped. Commits through `POST /v1/transactions/bulk`.

Every row is transformed in code. The model never sees an amount and cannot move a decimal point. One small call per file, whatever the row count.

Indonesian bank exports usually split debit and credit into two columns. That is a mapping fact, handled once in step 2, with the sign rule in code.

The proposal is model output, so `src/lib/column-mapping.ts` decides how much of it survives before the step renders it. Three rules, each because the model is answering about a file it has seen two rows of:

- A field this wizard does not have is dropped, because the service may learn one before the app does.
- A column the file does not have is dropped. Matching ignores case, so a model that answers `date` still maps the file's `Date`, and the file's own spelling comes back, because that is the key the rows are stored under.
- A column claimed twice keeps its first field. One column cannot be both the date and the amount.

**Every way the call can fail goes the same way**, and that path is the one that matters: a refusal, a timeout at fifteen seconds, a route the API has not registered yet, and an answer that mapped nothing all leave step 2 as it was, say so in one line, and let the user map by hand. The model is the optional half of this step. A wizard that waits on it is a wizard that is sometimes broken.

#### Image and PDF statement (AI-4)

Reached from the second panel on `/transactions/import`, beside the CSV picker, so the two paths are one screen and the file decides which one the user takes.

1. **Pick a wallet and upload.** A statement is one account's statement: every row has to land somewhere and move a balance, so the modal asks for a wallet first and defaults it to the workspace default. The file goes through the ordinary chunked vault upload.
2. `POST /v1/transactions/import` takes `{ vault_file_id, wallet_id }` and returns `202 {job_id}` immediately.
3. Extraction runs the [quality ladder](../ai/service.md#extraction-quality-ladder): a cheap model first, escalating only when the result scores poorly (D36).
4. The modal polls `GET /v1/transactions/import/{job_id}` every 2 seconds.
5. On success it shows the imported, skipped and duplicate counts, each counted apart because the fix for each is different.

Because this path is asynchronous, the ladder's wall-clock budget is looser here than for a receipt the user is watching. The budget is per document either way.

Closing the modal stops the watching, not the job. The job is in the API and carries on.

**The review list is not built, and cannot be from the current response.** The poll answers with counts, a status, an error and `stale`, and carries no rows:

```json
{ "data": { "id": "clx…", "status": "pending|succeeded|failed",
            "imported": 12, "skipped": 1, "duplicates": 3,
            "error": null, "stale": false,
            "created_at": "…", "updated_at": "…" } }
```

So "a review list with low confidence rows flagged" has nothing to render. The counts are honest and the skipped total is explained in a line. Closing it needs the rows on the response, for example `rows: [{ date, name, amount, confidence, status }]`, which is a change to the job endpoint rather than to this screen.

`stale` is the API's verdict, not the browser's, and the modal trusts it: the job's clock is the server's, and a browser whose clock is wrong would otherwise declare a healthy job dead. A stale or failed job offers **Try again**, which starts a new job over the file already in the vault.

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
- Account and category are editable in place from the row, each opening its
  picker inside the cell. The category change is its own one-field action; the
  account change reads the row back and re-sends it through
  `PATCH /v1/transactions/:id`, because moving a transaction to another wallet
  moves money, and the balances, the lock order and the audit row for that
  already live behind that route. **Moving a row to a wallet in another
  currency keeps the figure and re-reads it in the new wallet's currency**,
  exactly as editing the wallet in the form sheet does.
- The row has no inline expansion. A click opens the detail sheet, and the row
  actions menu carries the same thing as a named, keyboard-reachable item.
- **A header sorts in three clicks**: ascending, descending, then back to the
  order the server sent, which is what the live table does. Until a header is
  clicked the table does not sort at all.
- **Columns resize and stick** (D60). Every data column has a 4px handle on its right edge: drag to widen, double click to reset. Select, date and description stick to the left at offsets 0, 50 and 160; actions sticks to the right. The rest scroll under them.
- Measured column widths: select 50, date 110, description 320, amount 170, account 200, category 161, actions 72. Every cell carries a rule on its right as well as under it, except the last.
- The same file holds the heights, because the sticky rules depend on them:
  `ROW_HEIGHT` 45, `HEADER_HEIGHT` the same as a row, `GROUP_ROW_HEIGHT` 40 as
  the live day group row measures, and `GROUP_STICK_TOP`, where a day's header
  parks while that day is on screen. `GROUP_STICK_TOP` is derived,
  `HEADER_HEIGHT - 1`, not written as the 44 the live app hard-codes: one pixel
  short of the column header puts the two rules on top of each other instead of
  drawing a double line, and a literal would go quietly wrong the moment the
  header height moved. The analytic group height, `GROUP_ROW_HEIGHT` collapsed
  and `GROUP_ROW_HEIGHT + rows * ROW_HEIGHT` expanded, is also what lets row
  virtualisation skip a measurement pass (D76).
- **The table is always as wide as what holds it.** The last ordinary column,
  category unless it is hidden, takes whatever the others leave
  (`flex: 1 1 0%`); every other column keeps its pixel width and does not
  shrink. A table that stops short of its container leaves a strip of page
  beside rows that look like they should reach it.
- **A drag has a ceiling as well as a floor**, both carried on the cell the way
  the live table carries them: date 90 to 180, description 160 to 560, amount
  120 to 400, account 120 to 300, category 120 to 400. Without a ceiling one
  column can be dragged wide enough to push every other one off screen. The
  filling column has no handle, because its width is the remainder.
- The table carries its own rule on its left and right edges. The cells draw
  the grid between columns and the rows between rows, but the two outer sides
  belong to the scroll container, so they survive a column being hidden and
  the body being scrolled sideways.
- Above the table, one row and nothing else, as `transaction-client-header`
  has it: the search on the left, then grouping, the date range, the
  column-visibility control, the backup menu and the add button. There is no
  type filter, because the live header has none; `?type=` is still read by
  the load function, so a link can still carry it. There is no ready state
  at all since D107.

## The page, built as a specimen first

The whole page exists in the design system's **Pages** tab before it exists as
a route: `organisms/transactions/transactions-page.svelte` composes the header,
the filter, the table, the form sheet, the detail sheet, the export modal and
the bulk bar, with mock rows. Building it there first makes the route a data
problem rather than a layout one, and it is where the arrangement is agreed.

Layout, from the old `transaction-client-header`: the search on the left, then
grouping, the date range, the column-visibility menu, the backup menu and the
add button on the right, all on one line. **There is no page title.** The
sidebar already says which page this is, and a heading repeating it costs a
line of the table's height on every screen; the `h1` stays as `sr-only` so a
screen reader still has the landmark.

The **backup menu** is the old header's one menu for everything that moves
data in or out: back up or restore on this device, scan a receipt, and export
to a spreadsheet. Scanning a receipt is in there because it is another way of
getting a transaction in, and the old header has no button of its own for it.
A member without edit rights sees the export button alone, as they do in the
old header. The sheets, the modal and
the bulk bar hang off the page, not off the table, because they are the page's
state; the table takes `toolbar={false}` and reports selection and row opening
back through callbacks.

A member without edit rights sees no add and no import, only export
([permissions](../security/auth.md)).

One thing the port had to learn: two sheets cannot change places in the same
tick. The detail closes through the primitive's own `Close`, and the form opens
once the overlay has gone, or both end up shut.

## Data table: what is built and what is not

Measured against the old `organisms/data-table` and the transactions page that
configures it, on 2026-11-02.

**Built**: the flex row layout at 45px, measured column widths, sticky select,
date and description to the left and actions to the right, column resizing by
drag and by keyboard, the horizontal arrows in the last sticky column,
sortable headers, column visibility, day grouping with per-currency totals,
selection with a bulk bar, a row that expands in place, the in-cell account
and category pickers, a row-actions menu, the empty state, the filter bar with
facets, an amount range and a date range, and a footer count.

Three things about its height and its layers are worth stating, because none
of them is obvious from the markup:

- **The table is the scrollport, not the page.** The page is a bounded flex
  column (`min-h-0 flex-1`) inside the shell's `<main>`, and the table's scroll
  container scrolls both axes. The page itself does not scroll, so the header
  and the filter bar stay put and the body moves under them. There is no
  `calc(100svh - ...)` anywhere: that arithmetic would restate the shell's
  header height and padding in a second place, and the copy goes stale the
  first time the shell changes.
- **Day groups are sticky, with no JavaScript.** Each day is its own
  `role="rowgroup"` with `display: block`, and that is what scopes the
  stickiness: a sticky box is held inside its containing block, so a day's
  header travels only as far as the bottom of its own day and is then pushed
  out by the next one. One rowgroup around the whole body would let the first
  day's header ride over every other day. No scroll listener, no measurement.
  The group row carries `role="row"` and a single `role="cell"`, because a
  rowgroup may hold nothing but rows (D65).
- **Three sticky things coexist, so there is a z ladder**: the column header at
  `z-40`, a day group header at `z-30`, the sticky cells at `z-20`. The order
  is the order they pass each other: a day header slides under the column
  header, and a sticky column slides under both.

**Not built yet**, in the order the product will feel the lack:

| Missing | What the old app does | Cost |
|---|---|---|
| Loading state | `data-table-skeleton.tsx` renders skeleton rows per column type while a page loads. Ours renders nothing | Small |
| Persisted table settings | `use-table-settings` keeps column order, visibility and widths per table and per user. Ours reset on reload | Small to medium |
| Copy link to a row | `meta.onCopyUrl` on the old table. The detail sheet is already addressable as `?detail=`, so this is a button, not a feature | Small |
| XLSX in the import wizard | The old wizard reads a spreadsheet as well as a CSV. SheetJS is no longer published to npm and the version that is carries a known prototype-pollution advisory, so the dependency is a decision to take rather than to assume. **Still open.** A dependency that runs in the browser shares a context with the session ([hardening](../security/hardening.md#dependencies)), which is why this one is the team's call and not a default | Small once the dependency is chosen |
| A review list for a statement import | The counts are shown; the rows are not, because the job endpoint does not return any. See [image and PDF statement](#image-and-pdf-statement-ai-4) | Small, once the rows are on the response |

Built since: the receipt confirmation sheet, in the [canvas](chat.md#canvas) rather than as a modal, and the assistant's column mapping in step 2 of the wizard.

**In build**, the two the old app solves with a library and this one does not
(D76): row virtualisation and column reordering. The old app reaches for
`@tanstack/react-virtual` and dnd-kit; both are written here instead, against
this table's own row model. The virtualiser's selling point is dynamic
measurement, and this table needs none: a day group's height is analytic,
`GROUP_ROW_HEIGHT` collapsed and `GROUP_ROW_HEIGHT + rows * ROW_HEIGHT`
expanded. A drag library would fight the resize handle's own pointer capture,
since both want the pointer on the same header edge. TanStack Table itself
stays out, as D57 had it: the old app fabricates about a hundred lines of fake
TanStack row objects because grouping plus virtualisation does not fit its row
model, so adopting it here means adopting that workaround too, while the
sorting, visibility, sizing and selection it would replace already work and the
resize already answers the keyboard (D65) where `columnSizing` does not. Net
new browser dependencies for both features: zero, which counts for more than it
would on the server ([hardening](../security/hardening.md#dependencies)).

## UI port map

Each new component has a reference file in the old app. "Port" means reproduce the layout, the states and the interactions, in idiomatic Svelte 5. It does not mean transliterate React.

| New component | Old reference | Old size |
|---|---|---|
| `transactions/transaction-table.svelte` | `transaction-client.tsx` | 865 lines |
| `transactions/transaction-columns.ts` | `transaction-columns.tsx` | 567 lines |
| `transactions/transaction-header.svelte` | `transaction-client-header.tsx` | 165 lines |
| `transactions/transactions-form-sheet.svelte` | `transaction-form-sheet.tsx` | 907 lines |
| `transactions/transactions-detail-sheet.svelte` | `transaction-detail-sheet.tsx` | 611 lines |
| `transactions/bulk-edit-bar.svelte` | `transaction-bulk-edit-bar.tsx` | 124 lines |
| `transactions/export-modal.svelte` | `transaction-export-modal.tsx` | 173 lines |
| `transactions/import-wizard/*.svelte` | `transaction-import-modal.tsx` plus the four mapping components | 1,435 lines |
| `transactions/import-ai-modal.svelte` | `transaction-import-ai-modal.tsx`, `transaction-import-ai-review.tsx` | 371 lines |
| `transactions/receipt-confirmation-sheet.svelte` | `transaction-receipt-confirmation-modal.tsx` | 219 lines |
| `transactions/receipt-canvas.svelte` | new. The panel's contents: the read, its four states and the retry | |
| `transactions/grouping-selector.svelte` | `transaction-grouping-selector.tsx` | 32 lines |

### One component, two containers

`transactions-receipt-confirmation-sheet` and `transactions-form-sheet` each take a
`container` prop. `sheet` brings a `Sheet.Root` with it, as the transactions
page mounts them; `panel` renders the same form as the [canvas](chat.md#canvas)'s
contents, because the canvas is already the container.

The markup is one snippet either way, which is the point (D31, CHAT-13). A
panel version written separately would be a second place for a validation
rule, a field name or a footer to live, and the one that is edited less
often is the one that would be wrong.

`import-ai-modal` holds no fetch: the import page starts the job, polls it
and hands down what it says. `receipt-canvas` is the one exception to
"a component that fetches is a mistake"
([best practices](../best-practices/svelte-app.md#component-organization)):
the request is `requestReceipt`, tested on its own with a stubbed `fetch`
and aimed at this app's own route rather than the API (D5), and the
alternative was the same state machine on two pages.

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
- [Accounts](accounts.md) (a balance correction lands here as a transaction)
- [Chat](chat.md) (the assistant writes through the same service)
- [Vault](vault.md) (the file sheet, thumbnails and the picker)
- [Svelte app best practices](../best-practices/svelte-app.md)
- [Legacy app](../reference/legacy-app.md#where-to-look-when-porting)
