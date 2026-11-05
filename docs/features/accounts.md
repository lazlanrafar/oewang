# Feature: Accounts

Status: draft v0.1, 2026-11-03. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md) WAL-1 to WAL-6, plus UI-1, UI-5, UI-6 and UI-8.

An account is a wallet: a named place money sits, with its own currency and its own balance. Every transaction moves one. `/accounts` is the screen that owns them, and it is the screen the product never had: wallets used to be a tab of Settings, beside categories and the assistant's options.

## Update this doc when

- Changing a column, a card or an empty state on `/accounts`.
- Changing either sheet, or what a field in one of them writes.
- Changing how a balance adjustment is recorded. The route lives in [endpoints](../api/endpoints.md#wallets).
- Changing which wallet writes the page owns, or moving one back to Settings.
- Changing `walletTotals` or `inBaseCurrency` in `src/lib/wallets.ts`.

## Why it is its own screen

Settings managed wallets because that is where the old settings page put them, not because a wallet is a setting. A wallet carries a balance, a currency and a default flag, it is the thing a transaction points at, and correcting its balance writes to the ledger. None of that is configuration.

Keeping it in a tab had two costs. The screen had no room for the figures that make a wallet list readable, because a tab shares its page with two unrelated tabs. And a second screen would eventually grow its own copy of the same writes, which is how two rules drift apart.

So `/accounts` owns creating, renaming, grouping, setting the default, deleting and correcting a balance. Settings keeps categories and the assistant. One screen per job.

## Data

Tables, columns and indexes are in [data model](../data-model.md#accounts): `wallets` and `wallet_groups`, read with `transactions` only through the adjustment path below.

Nothing on this screen is a new table. The screen is new; the schema is not.

## The page

`/accounts`, one route, `(dashboard)/accounts/+page.server.ts` and `+page.svelte`.

The load reads wallets, wallet groups and today's rates together, because none of the three depends on another and the page cannot render until all three have answered. It declares `app:wallets` and `app:wallet-balances`, so a write made by the assistant refreshes this page the way it refreshes the transactions list ([chat](chat.md#keeping-the-rest-of-the-app-fresh)).

Search and the group filter live in the URL and are applied on the server (UI-8, D55). The page shows what the server matched, because filtering in both places is two rules to keep in step.

**Every mutation is a form action.** There is no `fetch` that writes. The page works with JavaScript disabled, and after a write the list is what the server holds rather than what the browser guessed. The two writes the table starts from a cell, setting the group and setting the default, post the action and then `invalidateAll()`: the cell has already drawn the new value, so a failure has to be able to put the row back.

A `member` sees the page and no write on it: no add button, no group select, and a row menu with **View** alone ([permissions](../security/auth.md#permission-matrix)).

There is no page title. The sidebar already says which page this is, and the `h1` stays as `sr-only`, as on the transactions page (UI-6).

## The three cards

`grid grid-cols-1 gap-4 md:grid-cols-3`, each card `flex flex-col gap-1 border border-border p-6`, its label `font-medium text-[10px] text-muted-foreground uppercase tracking-[0.2em]` and its value `mt-1 font-medium font-serif text-3xl tracking-tight`. Measured on the live app, class for class.

| Card | Figure | Where it comes from |
|---|---|---|
| Total balance | The workspace-currency sum | `walletTotals(...).total` |
| Accounts | Every live wallet, counted or not | `walletTotals(...).count` |
| Counted in totals | How many carry `is_included_in_totals` | `walletTotals(...).counted` |

They are local components rather than `molecules/stat-card`, which renders its value `font-mono text-xl` and carries a change indicator these have no use for.

**The third card is not the live app's.** The live page's third card says "Active" and counts wallets whose balance is greater than zero, ignoring the flag. There is no "active" in the schema, and a count of non-empty wallets explains nothing about the figure beside it. Ours counts `is_included_in_totals`, which is exactly what the total is a total of: the two cards then read as one sentence.

Every figure arrives formatted. The component does no arithmetic and never sees a number (D12, D27).

### The total, and when it is partial

A wallet in the workspace currency contributes its balance. A foreign wallet is converted at today's rate, fetched per currency in the load. This is the one read path that converts: a balance is a live figure with no stored `base_amount` to sum, unlike a transaction (TXN-19).

A wallet whose currency has no rate today is **left out**, and the card says how many were left out. An honest partial figure beats a whole one that is wrong, and refusing to render the screen because one rate is unavailable would be worse than either. It is the same behaviour the Settings group total already had, in `inBaseCurrency`, which both screens share.

The cards describe the workspace, not the filtered view. A search narrows the table only; a total that moved with it would read as money having disappeared.

## The table

Measured on the live page, and declared in `organisms/accounts/accounts-data-table-column.ts`:

| Column | Width | Notes |
|---|---|---|
| Name | 200, sticky left | An amber star marks the default wallet (WAL-3) |
| Group | 150 | An in-cell `<select>`, which writes on change |
| Balance | 150, right aligned | In the account's own currency, at its own precision (WAL-2, UI-5) |
| Created | 220, and it takes the remainder | The last ordinary column fills the table's width |
| Actions | 90, sticky right | Furniture: the row menu, never offered in a column menu |

Row height 45, taken from `molecules/data-table/data-table-column.ts` rather than written again here. The widths are declared in `organisms/accounts/accounts-data-table-column.ts` as ordinary `ColumnSpec` entries, the same shape the transactions columns use.

**There is no sorting**, because the live page has none. The list is unpaginated and arrives in the order the API chose, which is group, then sort order, then name.

The row opens the detail sheet on click as a pointer convenience, so it stays out of the tab order; the actions menu carries the same thing as a named, keyboard reachable item. A balance is never editable from the row.

### One table, two screens

Both this screen and the transactions list render
`molecules/data-table/data-table.svelte`. The shell owns everything that is
the same whatever is in a row, and each module owns what only it knows:

- **The molecule owns the geometry and the ARIA**: the scrollport, the sticky
  header, the flex row at a pixel width per column, the sticky offsets, which
  edge drops its rule, the `table`, `rowgroup`, `row` and `cell` roles, the
  resize handles, the sideways arrows at the seam where the scrolling columns
  start, group rows that stick while their block is on screen, and the
  sentinel that asks for the next page. The arithmetic behind the widths lives
  once, in `data-table-layout.svelte.ts`.
- **The caller owns the only things tables actually differ on**: which
  columns, through `ColumnSpec`; what a header says and what a cell renders,
  through the `head` and `cell` snippets; and, where there are blocks, what a
  group's heading shows, through `groupRow`.

The accounts table is therefore about 180 lines, almost all of them cell
contents, and the transactions table went from 1116 lines to about 620 when it
moved onto the same shell (D78). Neither can drift from the other on the part
a reader would notice.

What this screen does not switch on: grouping, selection, the in-cell account
and category editors, and the next-page trigger. They are props it does not
pass.

## The two sheets

Both are containers. Neither writes: each mounts a form that posts to one of the page's actions, and the page decides what a save means by passing its own `enhance`. A sheet rendered without a page still posts natively.

### The form sheet, for create and edit

`accounts-form-sheet.svelte` follows the old app's sheet rules: content at `p-0`, a header with no rule, a body that scrolls with `pb-[100px]`, and a footer over the body carrying one full-width submit and no cancel, because the overlay and Escape already close it.

The fields are a separate component, `accounts-form-fields.svelte`, so there is one field set rather than two that drift. Every control in it is native and submits by itself: a `<select>` for the group, a text input for the currency, a checkbox for the totals flag. Two of those need a trick a plain form always needs:

- An empty group option is a real choice, not a prompt. It is how an account leaves its group, and the action turns `''` into a null, which is the value that detaches it. Absent, null and a string are three different instructions to `PATCH /v1/wallets/{id}`.
- An unticked checkbox submits nothing at all, and a missing field reads to the action as "leave it counted". A hidden `false` companion sits after the box, so the first value under that name is `true` when it is ticked and `false` when it is not. Without it the flag can be switched on and never off.

**There is no balance field.** A new account starts at zero, and an opening figure is a transaction rather than a column write (TXN-3). The detail sheet records it.

The currency field can be locked, for the wallet that already has a live transaction (WAL-6). A disabled control submits nothing and an absent `currency_code` reads as "clear it", so the locked field carries the current code in a hidden input and the save is a no-op on that column rather than a blanking of it.

### The detail sheet, for one account

`accounts-detail-sheet.svelte` is a port of the old `account-detail-sheet.tsx` with the two parts that made it dangerous taken out. The old sheet debounced the name field by 500 milliseconds and wrote it over the network with nothing on screen saying so, and it moved a balance by PATCHing the column.

Here every write is one the reader starts: a submit button for the name, a change for the group and the totals switch, and a blur for the balance. The name form still works with JavaScript off, because its save is a real submit; the three that submit on change need script, and without it they do nothing rather than silently dropping a write.

The balance is the sheet's headline figure, `font-serif text-5xl`, and clicking it turns it into an input. A foreign wallet shows its balance in the workspace currency underneath, at today's rate, and shows nothing there when no rate is known rather than guessing one.

## A balance is never written

Typing a figure into the detail sheet posts to `POST /v1/wallets/{id}/adjust` with the **target**, not the difference. The API reads the wallet, works out `target - current` and creates one transaction for it through the ordinary create path: an `income` when the difference is positive, an `expense` for its absolute value when it is negative, named "Balance adjustment", dated today, carrying no category, denominated in the wallet's own currency.

So the balance arrives at the figure as a consequence, and the rules that make a balance trustworthy apply to a correction too: the wallet row is locked, the balance moves and the audit row is written inside one database transaction (D13, D14, OPS-1). Full behaviour in [endpoints](../api/endpoints.md#wallets).

The alternative, a writable `balance` column, is what the old app did. It makes the ledger and the balance disagree with nothing on the row saying why, and "why is this number what it is" is the question the product exists to answer (OPS-8).

Three things follow from the shape:

- **A target equal to the current balance writes nothing** and still succeeds. The browser checks it too, with `compareDecimals` rather than a string comparison, because `812500` and `812500.00` are the same money and posting that pair would record an adjustment for nothing.
- **The read and the write are not one atomic act.** A transaction committed by someone else in between moves the balance after the difference was computed, and the wallet lands beside the target rather than on it. Closing that would mean computing the difference under the wallet's own lock, which means a second copy of the create path. A manual correction racing another write is not worth that.
- A correction belongs to **no category**. Inventing one would put the money in a report the user never spent it in.

A correction records `web` as its source, so it is an ordinary row in the transaction list and in that wallet's history.

## What is deliberately not built

| Missing | What the old app does | Why, and what it costs |
|---|---|---|
| Group management on this screen | Create, rename and delete a group from the accounts page | The page's actions exist (`createGroup`, `updateGroup`, `deleteGroup`) and nothing on screen calls them yet. Settings used to be where a group was created, and that tab is gone, so **no screen creates a group today**: a group is assigned in the row cell and comes from the seed or the API. The actions and the strings are already here, so this is the next piece of work, not a design question |
| A group filter control | A group dropdown in the header | The load reads `?group_id=`, including `group_id=none` for the ungrouped, so a link still carries it. Only the control is missing. Small |
| Column visibility | A column menu in the header | Five columns, one of which is furniture. Not worth a menu yet |
| Column resizing | A drag handle per column | `columns.ts` declares `resizable` and `minWidth`/`maxWidth` per column, and the shell takes a `widths` map, but nothing draws a handle. The declaration is ready; the handle is not. Small |
| Sorting | Three-click sortable headers | The live accounts page has none either, so this is a match rather than a gap |
| Reordering wallets | Move a wallet up or down within its group | The Settings tab owned `sort_order` and went with the tab, so **nothing writes it today**. The list still orders by it, so the column is read and never set. Moving the gesture here means a drag or a pair of buttons and the same swap the settings action used |
| A plain form for the sheets | | Both sheet components are written to be rendered inside `<noscript>` as a plain form, and the page does not render them there yet. The create path therefore needs script even though every action behind it does not |

## UI port map

Each component has a reference file in the old app. "Port" means reproduce the layout, the states and the interactions in idiomatic Svelte 5. It does not mean transliterate React.

| New component | Old reference | Old size |
|---|---|---|
| `accounts/accounts-data-table.svelte` | `accounts-client.tsx` | 272 lines |
| `accounts/accounts-data-table-column.ts` | `account-columns.tsx` | 274 lines |
| `accounts/accounts-summary-cards.svelte` | `accounts-client-cards.tsx` | 46 lines |
| `accounts/accounts-form-sheet.svelte` plus `accounts-form-fields.svelte` | `account-form-sheet.tsx` | 318 lines |
| `accounts/accounts-detail-sheet.svelte` | `account-detail-sheet.tsx` | 272 lines |
| The search and add row, in `+page.svelte` | `accounts-client-header.tsx` | 60 lines |

Old files are at `references/oewang-old/apps/app/components/organisms/accounts/`.

The old components carry weight that does not come along: quota gates, multi-locale strings, realtime invalidation, a column-visibility menu and a balance PATCH. The column file is the clearest case, 274 lines against 27, because the new one declares widths and nothing else while the old one holds its cell renderers too.

## Testing

| Layer | Coverage |
|---|---|
| Unit (Rust) | An adjustment up writes one income and one down writes one expense, each for the difference; a target equal to the balance writes nothing; a foreign wallet lands on its target in its own currency; a `member` is refused |
| Unit (Rust) | A wallet `PATCH` never moves a balance, whatever the body carries |
| Unit (TypeScript) | `walletTotals` counts only flagged wallets, converts a foreign one, and reports the wallets it left out for want of a rate |
| End to end (Playwright) | Create an account, set it as the default, adjust its balance, and see the adjustment in the transaction list |

## Related docs

- [Docs index](../README.md) and [PRD](../prd.md#63-wallets-and-categories-wal-cat)
- [Data model](../data-model.md#accounts)
- [API endpoints](../api/endpoints.md#wallets)
- [Transactions](transactions.md), which is where an adjustment ends up
- [Auth and access control](../security/auth.md#permission-matrix)
- [Svelte app best practices](../best-practices/svelte-app.md)
- [Legacy app](../reference/legacy-app.md#where-to-look-when-porting)
