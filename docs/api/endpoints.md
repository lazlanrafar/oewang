# API Endpoints

Status: draft v0.1, 2026-11-02. Part of the [oewang docs](../README.md). Follows [API conventions](conventions.md).

The full route catalog, grouped by module. This doc is the source of truth for routes; no other doc repeats a route table.

## Update this doc when

- Adding, removing or renaming a route.
- Changing a role gate, a query parameter or a request body field.

## Conventions recap

- Base path `/v1`. Envelope, errors, pagination and encoding are in [conventions](conventions.md).
- The workspace is never in the path. It comes from the JWT (AUTH-4).
- Role column values: `public` (no token), `any` (any member), `admin+` (`owner` or `admin`), `owner`, `service` (service key only).
- Role rules are in [auth](../security/auth.md#permission-matrix).

## Health and transport

These four are the only plaintext routes ([exceptions](encryption.md#plaintext-exceptions)). Everything else is OWE1.

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/health` | public | Liveness. Returns `{"status":"ok"}` outside the envelope |
| GET | `/health/ready` | public | Readiness. Checks the database connection |
| GET | `/.well-known/oewang-keys` | public | Ed25519 public signing keys with their key IDs |
| POST | `/v1/handshake` | public | Establish a crypto session ([handshake](encryption.md#handshake)) |

## Auth

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/v1/auth/register` | public | Create user, workspace and `owner` membership in one transaction. Returns a JWT (WS-5) |
| POST | `/v1/auth/login` | public | Verify credentials, return a JWT (AUTH-2) |
| POST | `/v1/auth/refresh` | public | Rotate the refresh cookie and issue a new access token. Reuse revokes the family (AUTH-9) |
| POST | `/v1/auth/logout` | any | Revoke the refresh row and clear both cookies |
| POST | `/v1/auth/logout-all` | any | Revoke every live refresh row for the user |
| GET | `/v1/auth/sessions` | any | The user's live sessions, with user agent and last use |
| POST | `/v1/auth/forgot-password` | public | Always answers 204, whether or not the address exists (AUTH-10) |
| POST | `/v1/auth/reset-password` | public | Token plus a new password. Revokes every session on success |
| GET | `/v1/auth/me` | any | Current user (with `profile_picture`, a photo version id or null), workspace and role |
| PATCH | `/v1/auth/me` | any | `{name}`; a blank name clears it (AUTH-11) |
| PUT | `/v1/auth/me/colors` | any | `{income_color, expense_color}`, each `#rrggbb` or null for the default; both every time. Audited as `user.colors_updated`. `GET /v1/auth/me` returns them on `user` (UI-9, D100) |
| GET | `/v1/auth/me/avatar` | any | `{type: "image/jpeg", data}` base64, or 404 when there is no photo (AUTH-13) |
| PUT | `/v1/auth/me/avatar` | any | `{data}` base64 JPEG, PNG or WebP up to 700 KB; stored as a 256px square JPEG. Answers `{profile_picture}` |
| DELETE | `/v1/auth/me/avatar` | any | Remove the photo |
| POST | `/v1/auth/change-password` | any | `{current_password, new_password}`. A wrong current password is a 422 field error. Ends every other session; answers a fresh session (AUTH-12) |
| POST | `/v1/auth/switch-workspace` | any | Re-scope the JWT to another workspace the user belongs to (WS-2) |

`POST /v1/auth/register`

```json
{ "email": "a@b.com", "password": "…", "name": "Azlan", "workspace_name": "Personal" }
```

`POST /v1/auth/switch-workspace`

```json
{ "workspace_id": "clx…" }
```

Returns `NOT_A_MEMBER` if the user has no live membership row.

## Workspaces and members

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/v1/workspaces` | any | Workspaces the user belongs to, with their role in each |
| POST | `/v1/workspaces` | any | `{name, currency_code}`. A new workspace the caller owns, seeded; at most 10 owned. The client then switches into it (WS-6) |
| GET | `/v1/workspaces/current` | any | The current workspace, with `currency_locked`: true once any transaction exists (WAL-6) |
| PATCH | `/v1/workspaces/current` | admin+ | Update name, slug, country. Currency code only while no transaction exists, otherwise `WORKSPACE_CURRENCY_LOCKED` (WAL-6) |
| GET | `/v1/workspaces/current/currency/preview?to=USD` | owner | What a conversion would touch: `{ from, to, suggested_rate, rate_date, transactions, budgets }`, the rate from the newest stored snapshot or null (WAL-7) |
| POST | `/v1/workspaces/current/currency/convert` | owner | `{ currency_code, rate }`, rate a decimal string of new units per old unit. Reprices every transaction and budget at that rate in one transaction; returns the counts. Audited `workspace.currency_converted` (WAL-7, D105) |
| GET | `/v1/workspaces/current/members` | any | Members with role and join date |
| DELETE | `/v1/workspaces/current/members/{user_id}` | admin+ | Remove a member. `LAST_OWNER` if it is the only owner (WS-4); `INSUFFICIENT_ROLE` if an admin targets an owner. Audited `member.removed` |
| PATCH | `/v1/workspaces/current/members/{user_id}` | admin+ | Change a member's role. Same `LAST_OWNER` and owner rules; nobody grants above their own role. Audited `member.role_changed` |
| GET | `/v1/workspaces/current/invites` | admin+ | Pending invites |
| POST | `/v1/workspaces/current/invites` | admin+ | Invite by email with a role (WS-3). Refuses a current member (422 on `email`) and replaces a pending invite to the same address. Returns the raw `token` once. Audited `member.invited` |
| DELETE | `/v1/workspaces/current/invites/{id}` | admin+ | Revoke an invite. Audited `member.invite_revoked` |
| POST | `/v1/workspaces/accept-invite` | any signed-in user | Accept an invite by token. Returns `{ workspace_id }`. `INVITE_INVALID` unless the caller's email is the invited one; a live membership keeps its role. Audited `member.joined` |
| DELETE | `/v1/workspaces/current` | owner | Soft-delete the workspace |
| GET | `/v1/workspaces/current/usage` | any | Storage used and model tokens, by month and feature (USG-1, USG-3, D92) |
| POST | `/v1/feedback` | any | Send feedback: `{ type: bug\|feature\|other, message }`, 5000 characters at most. 201 `{ id }`. Audited `feedback.sent` (FB-1) |

### `GET /v1/workspaces/current/usage` response

```json
{ "data": {
    "storage": { "bytes": 18432771, "files": 42 },
    "ai": {
      "month": { "input": 120433, "output": 9120 },
      "total": { "input": 984210, "output": 77310 },
      "by_feature": [
        { "feature": "receipt", "month": { "input": 80211, "output": 4410 },
          "total": { "input": 610002, "output": 40120 }, "calls": 57 }
      ]
    }
} }
```

`storage` is `SUM(size)` and the count over ready, live files; nothing stores it. `month` is since the first of the current calendar month in UTC. The headline `month` and `total` are summed from the `by_feature` rows, so the cards and the table on the settings page cannot disagree. `calls` counts all time. Nothing here is a limit ([usage](../features/usage.md)).

## Wallet groups

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/v1/wallet-groups` | any | List, ordered by `sort_order` |
| POST | `/v1/wallet-groups` | admin+ | Create |
| PATCH | `/v1/wallet-groups/{id}` | admin+ | Update name or sort order |
| DELETE | `/v1/wallet-groups/{id}` | admin+ | Soft delete. Member wallets have `group_id` set to null |

## Wallets

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/v1/wallets` | any | List with balances in each wallet's own currency. Ordered so a group's wallets are contiguous, with `group_name` joined; ungrouped wallets come last |
| GET | `/v1/wallets/{id}` | any | One wallet |
| POST | `/v1/wallets` | admin+ | Create. `currency_code` optional, defaults to the workspace currency (WAL-5) |
| PATCH | `/v1/wallets/{id}` | admin+ | Update name, group, sort order, totals flag. Currency only while the wallet has no live transaction, otherwise `WALLET_CURRENCY_LOCKED` (WAL-6) |
| POST | `/v1/wallets/{id}/set-default` | admin+ | Make default, clearing the previous default in the same transaction (WAL-3) |
| POST | `/v1/wallets/{id}/adjust` | admin+ | Correct a balance to a stated figure. Body `{ "balance": "100000" }` as a decimal string. Answers with the updated wallet |
| DELETE | `/v1/wallets/{id}` | admin+ | Soft delete. `WALLET_HAS_TRANSACTIONS` if any live transaction references it (WAL-4) |

Balance is never writable through the API. It changes only as a consequence of a transaction (TXN-3). A manual correction is recorded as an income or expense transaction, like any other movement.

`/adjust` is that rule, not an exception to it. It writes no column: it reads the wallet, works out `target - current`, and creates one transaction for the difference through the ordinary create path, so the balance arrives at the figure as a consequence. A positive difference becomes an `income`, a negative one an `expense` for its absolute value, and a difference of zero writes nothing and still succeeds. The transaction is named "Balance adjustment", dated today, carries no category, is denominated in the wallet's own currency, and records the caller's surface as its source (`web`, or `mcp` from an MCP tool). It takes the wallet lock, moves the balance and writes its audit row inside one database transaction like every other write (D13, D14, OPS-1).

## Exchange rates

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/v1/fx/rate` | any | Rate for a currency pair on a date, for prefilling the form. Query: `from`, `to`, `date` (TXN-20) |
| GET | `/v1/fx/currencies` | any | Every currency in the newest snapshot, unpaged (about 170), the workspace currency first at rate one, each row as in `/v1/fx/rates`. What the currency pickers offer (FX-2) |
| GET | `/v1/fx/rates` | any | The stored snapshot, paged, every currency against the workspace currency (FX-1). Query: `search` (part of a code), `date` (newest snapshot on or before it, default the newest), `sort` `code` (default) or `rate`, `order`, `page`, `limit`. Row: `{id, currency_code, home_code, rate, inverse, date}`, `rate` being one `currency_code` in `home_code` |

The response is a suggestion. The rate the user confirms is sent back on the transaction and stored there (D39). No read path consults this endpoint, because `base_amount` was computed at write time, so a report is a plain sum.

## Categories

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/v1/categories` | any | List. Query: `type=income\|expense` |
| POST | `/v1/categories` | admin+ | Create |
| PATCH | `/v1/categories/{id}` | admin+ | Update name, type or sort order |
| DELETE | `/v1/categories/{id}` | admin+ | Soft delete. Sets `category_id` to null on its transactions (CAT-2) and deletes its budget (BUD-4) |

## Budgets

D103, BUD-1 to BUD-3. Every figure is computed by the API, with a `_formatted` twin (D27).

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/v1/budgets` | any | Status for one month. Query: `month=YYYY-MM` (default: the current month, UTC), `search` (category name, contains), `sort=category\|amount\|spent\|remaining\|percent` (default `category`, the category order), `order=asc\|desc` (default `asc`). Unpaged: one row per expense category at most |
| POST | `/v1/budgets` | admin+ | Create. Body: `{ "category_id", "amount": "1500000" }`. A category that is not an expense category of this workspace, or one that already has a budget, is `VALIDATION_FAILED` on `category_id` |
| PATCH | `/v1/budgets/{id}` | admin+ | Change the limit. Body: `{ "amount": "2000000" }`. The category never changes |
| DELETE | `/v1/budgets/{id}` | admin+ | Soft delete |

`GET /v1/budgets` answers `{ month, from, to, currency_code, budgeted, spent, remaining, percent, state, count, over_count, summary, budgets: [{ id, category_id, category_name, amount, spent, remaining, percent, state }] }`, each money field with its `_formatted` twin. The totals cover every budget whatever the search. `state` is `safe`, `warning` (80% or more) or `over` (past 100%). The same object is the `budget` canvas payload.

## Transactions

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/v1/transactions` | any | Paginated list (TXN-8) |
| GET | `/v1/transactions/summary` | any | Totals by category, wallet and type for a date range |
| GET | `/v1/overview` | any | The overview's figures for `?from&to` (both required, days, at most 60 months): income, expense and net with the previous equal-length period, zero-filled months, monthly averages, top categories per type. Built by the same report module as the analysis canvases (D87, D88) |
| GET | `/v1/transactions/export` | any | CSV download honouring the active filters (TXN-10) |
| POST | `/v1/transactions` | admin+ | Create. Adjusts wallet balances (TXN-3) |
| POST | `/v1/transactions/bulk` | admin+ | Create many. Used by the CSV wizard commit (TXN-11) |
| POST | `/v1/transactions/bulk-update` | admin+ | Set the category of many; `category_id: null` clears it (TXN-14) |
| POST | `/v1/transactions/bulk-delete` | admin+ | Soft-delete many, reversing each balance (TXN-14) |
| POST | `/v1/transactions/import` | admin+ | Read an already-uploaded statement image or PDF. Returns `202 {job_id}` (AI-4) |
| POST | `/v1/transactions/import/csv` | admin+ | A file's rows as they came out of it, plus a column mapping. Every figure and date is parsed in Rust (TXN-11, D28). Returns created, duplicate and skipped counts |
| POST | `/v1/transactions/import/map-columns` | admin+ | Column names plus two sample rows in, a proposed mapping out (AI-9). Proxies the AI service, because the browser never calls it directly (PLT-4) |
| GET | `/v1/transactions/import/{job_id}` | any | Poll an import job: status plus imported, skipped and duplicate counts, and whether it has gone stale (AI-6) |
| GET | `/v1/transactions/{id}` | any | One transaction with items and attachments |
| GET | `/v1/transactions/{id}/history` | any | Audit history for this transaction: actor, surface, before and after, newest first (OPS-8) |
| PATCH | `/v1/transactions/{id}` | admin+ | Update. Re-applies the balance delta (TXN-4) |
| DELETE | `/v1/transactions/{id}` | admin+ | Soft delete. Reverses the balance (TXN-5) |

### `GET /v1/transactions` query parameters

| Parameter | Type | Notes |
|---|---|---|
| `wallet_id` | string, repeatable | Matches `wallet_id` or `to_wallet_id`, so a transfer shows under both of its wallets. May repeat: `?wallet_id=a&wallet_id=b` is the union, a row in either wallet. Omitted, empty and no values at all mean no filter |
| `category_id` | string, repeatable | May repeat: `?category_id=a&category_id=b` is the union, a row in either category. Omitted, empty and no values at all mean no filter |
| `type` | enum | `income`, `expense`, `transfer` |
| `start_date` | date | Inclusive |
| `end_date` | date | Inclusive |
| `search` | string | Matches `name` or `description`, case insensitive |
| `min_amount` | string | Inclusive lower bound, compared on the **base amount**, the workspace's own currency, not on the figure the row was entered in (D77). A decimal string, never a number (D12). Omitted and empty both mean no bound: a cleared filter sends `?min_amount=` |
| `max_amount` | string | Inclusive upper bound, same rules |
| `sort` | enum | `date` (default), `amount`, `name`, `created_at`. `amount` sorts on the base amount. `name` puts a row with no name last in both directions, so blanks do not jump to the top when the order flips |
| `order` | enum | `desc` (default), `asc` |
| `page`, `limit` | integer | `limit` capped at 100 |

### `POST /v1/transactions` body

```json
{
  "type": "expense",
  "wallet_id": "clx…",
  "to_wallet_id": null,
  "category_id": "clx…",
  "amount": "50000.0000",
  "date": "2026-11-02T12:30:00+08:00",
  "name": "Lunch",
  "description": null,
  "attachment_ids": ["clx…"],
  "items": [
    { "name": "Nasi goreng", "quantity": "1", "unit_price": "35000.0000", "amount": "35000.0000" }
  ]
}
```

`items` and `attachment_ids` are optional. Both are written inside the same database transaction as the transaction insert, so confirming a receipt is one act that either happens or does not: a create followed by six item calls is six acts that can each half-fail, and a crash after the third leaves a transaction whose items do not add up with nothing saying why. Items move no money; only the transaction's own `amount` does (TXN-12). `PATCH` ignores `items`, because editing one needs to address it, which the item routes do.

`source` is optional and is `web` or `receipt`. It names the surface for the audit row (OPS-8) and it is a claim, deliberately a narrow one: `chat` and `import` are written by the API's own paths, so a client naming either is refused. Without it a write is `web`.

### `POST /v1/transactions/import` body

```json
{ "vault_file_id": "clx…", "wallet_id": "clx…" }
```

The bytes are not here. A statement is up to 10 MB and a body is capped at 1 MB (SEC-18, VLT-1), so the document is uploaded through the chunked vault path first and named by id (D69, D23). The wallet is required because a statement is an account's statement and every row it holds moves that account's balance.

Answers `202 {"data": {"job_id": "clx…"}}` and the work continues in a task: the extraction ladder may spend 45 seconds on the document before the first row exists, which is longer than the request timeout (SEC-19, AI-10).

`GET /v1/transactions/import/{job_id}` then answers:

```json
{ "data": {
    "id": "clx…", "status": "succeeded", "vault_file_id": "clx…",
    "imported": 40, "skipped": 2, "duplicates": 4,
    "error": null, "stale": false,
    "review": {
      "rows": [
        { "date": "2026-11-02", "name": "WARUNG TEKKO", "amount": "87500",
          "direction": "expense", "status": "imported" }
      ],
      "truncated": false
    },
    "created_at": "2026-11-03T09:00:00Z", "updated_at": "2026-11-03T09:02:11Z"
} }
```

`status` is `pending`, `succeeded` or `failed`. The three counts are null until it finishes and are separate because they are three different things that happened to a row (TXN-16).

`review` is null until it finishes. Its `rows` pair each extracted row with what became of it, `imported`, `duplicate` or `skipped`, because a count cannot answer "which of my rows was the duplicate". The figures are exactly the strings the model read, not a second parse of them. The list is capped at 200 rows and says so in `truncated`; the counts beside it stay exact for the whole file, which may be up to 5,000 rows. `error` is a code, never a message: a message could quote the statement back (OPS-3). `stale` is computed, not stored: a `pending` job older than 10 minutes is one whose task died with its process, and the modal offers a retry rather than polling forever. The retry re-reads `vault_file_id`, so a failure never costs a second upload (D71).

### `POST /v1/transactions/import/map-columns` body

```json
{ "columns": ["Tanggal", "Keterangan", "Debet", "Kredit"],
  "sample_rows": [ { "Tanggal": "02/11/2026", "Keterangan": "WARUNG TEKKO", "Debet": "50.000" } ] }
```

At most two sample rows travel, and every cell is clamped to 80 characters before the API forwards them (D28, [column mapping](../ai/service.md#csv-column-mapping)). A failure is relayed as it comes: step two of the wizard works by hand, and an empty step is a better answer than a guessed mapping.

## Transaction line items

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/v1/transactions/{id}/items` | any | Line items for a transaction |
| POST | `/v1/transactions/{id}/items` | admin+ | Add one |
| PUT | `/v1/transactions/{id}/items/{item_id}` | admin+ | Replace one |
| DELETE | `/v1/transactions/{id}/items/{item_id}` | admin+ | Soft delete one |

Line items do not affect wallet balances. Only the parent transaction's `amount` does (TXN-12).

## Items

Every line item across the workspace's live transactions, read only (D97).

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/v1/items` | any | One row per item, paged (ITM-1). Query: `search`, `currency` (items paid for in it), `key` (one exact item, needs `currency`), `sort` `last_bought_at` (default, newest first), `name`, `purchases` or `last_price`, `order`, `page`, `limit` |
| GET | `/v1/items/history` | any | One item's purchases, newest first, paged (ITM-2). Query: `key`, `currency` (both required), `page`, `limit` |

An item row is `{id, key, name, currency_code, purchases, last_bought_at, last_price, last_quantity, last_unit, last_transaction_id, last_discount, min_price, max_price}`; `id` is `{currency_code}:{key}`. A purchase row is `{id, transaction_id, transaction_name, wallet_name, date, name, brand, quantity, unit, price, amount, currency_code, transaction_discount}`. `price` is one unit's price: `unit_price`, else `amount / quantity`, else `amount`.

A line with a negative amount is a discount and is never an item. `transaction_discount` is the sum of the discount lines on that purchase's transaction (negative, or null), and `last_discount` the same for the latest purchase. It belongs to the receipt, not to the item: items keep no position, so which item a discount followed is not known (D97).

## Files

Bytes travel through the API in encrypted chunks, not through a signed object-storage URL (D23, [file bytes](encryption.md#file-bytes)).

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/v1/vault/files` | any | The workspace's ready, live files, paged. Query below (VLT-6) |
| POST | `/v1/vault/files` | admin+ | Begin an upload: `{filename, content_type, size_bytes}`. Returns `{id, chunk_size, chunk_count, status:"pending"}` (VLT-1) |
| PUT | `/v1/vault/files/{id}/chunks/{index}` | admin+ | Send one 512 KiB chunk as `{"data":"<base64>"}` |
| POST | `/v1/vault/files/{id}/complete` | admin+ | Verify every chunk, record the SHA-256, set status `ready` |
| GET | `/v1/vault/files/{id}` | any | Metadata, tags, `thumbnail`, `used_by`, and the newest 20 transactions carrying it (VLT-7, VLT-10) |
| PATCH | `/v1/vault/files/{id}` | admin+ | Rename, retag, or both: `{name?, tags?}`. Audited as `file.updated` (VLT-8, VLT-9) |
| GET | `/v1/vault/files/{id}/thumbnail` | any | A 320x320 JPEG preview, `{type:"image/jpeg", data:"<base64>"}`, made on first request. `THUMBNAIL_UNAVAILABLE` for a PDF or bytes that do not decode (VLT-12, D91) |
| GET | `/v1/vault/files/{id}/chunks/{index}` | any | One chunk back, `{index, data}` (VLT-3, as revised by D23) |
| DELETE | `/v1/vault/files/{id}` | admin+ | Soft delete, and detach it from every transaction in the same database transaction (VLT-11) |

The declared `content_type` is checked against the bytes sniffed from chunk 0 at completion. A mismatch fails the upload with `UNSUPPORTED_FILE_TYPE` (SEC-12).

### `GET /v1/vault/files` query parameters

| Parameter | Values | Notes |
|---|---|---|
| `search` | text | Matches the name with `ILIKE`. `%` and `_` are escaped, so they match themselves |
| `type` | `image`, `pdf` | Anything else is `VALIDATION_FAILED`, as is an unknown `size` or `sort` |
| `size` | `lt1`, `1to5`, `gt5` | Megabytes, the picker's three bands |
| `tag` | text | One tag, exact |
| `sort` | `newest` (default), `name_asc`, `name_desc`, `size_desc`, `size_asc` | Mapped to fixed SQL, never interpolated |
| `page`, `limit` | integers | As in [pagination](conventions.md#pagination) |

Each row is `{id, name, size, type, tags, thumbnail, used_by, created_at}`. `used_by` counts live attachment rows on live transactions. `thumbnail` is `null` until a preview has been asked for, `false` when none can be made, `true` when one is stored.

### `GET /v1/vault/files/{id}` response

The list row plus `sha256`, `status` and `transactions`:

```json
{ "data": {
    "id": "clx…", "name": "warung-tekko.jpg", "size": 482113, "type": "image/jpeg",
    "sha256": "…", "status": "ready", "tags": ["Receipt"], "thumbnail": true,
    "created_at": "2026-11-05T03:12:00+00:00",
    "used_by": 1,
    "transactions": [
      { "id": "clx…", "name": "Warung Tekko", "date": "2026-11-02T00:00:00+00:00",
        "type": "expense", "amount": "87500.0000", "currency_code": "IDR" }
    ]
} }
```

`transactions` holds the newest 20; `used_by` is the exact count, so the sheet can say how many it is not showing. `amount` is a decimal string in the wallet's currency (D12).

### `PATCH /v1/vault/files/{id}` body

```json
{ "name": "Warung Tekko, 2 Nov", "tags": ["Receipt", "Food"] }
```

An absent field is left alone. The name is cleaned the way an upload filename is. Tags are trimmed and deduplicated case-insensitively, keeping the first spelling; more than 10, or one over 32 characters, is `VALIDATION_FAILED` rather than a silent cut, because a cut tag is a label the member did not write.

### `DELETE /v1/vault/files/{id}`

Soft-deletes the file and its live `transaction_attachments` rows in one database transaction. The audit row's `after` is `{"detached": n}`. The chunks and the stored preview are removed after commit.

## Chat

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/v1/ai/sessions` | any | Sessions, newest activity first |
| POST | `/v1/ai/sessions` | any | Create a session |
| GET | `/v1/ai/sessions/{id}` | any | Session with its messages |
| PATCH | `/v1/ai/sessions/{id}` | any | Rename |
| DELETE | `/v1/ai/sessions/{id}` | any | Soft delete |
| POST | `/v1/ai/chat/stream` | any | Server-sent events. Persists both messages (CHAT-2) |
| POST | `/v1/ai/receipt/parse` | admin+ | Image to receipt draft. Persists nothing (AI-1, AI-2) |
| POST | `/v1/receipts/pending` | admin+ | `{vault_file_id}`. Queue a receipt the reader could not answer for; 202 with `{id, status, next_attempt_at}`. Queuing a file twice returns the same job (AI-12, D95) |
| GET | `/v1/receipts/notices` | any | The caller's queued web receipts that ended and were not told yet: `{id, status, code, file_name, transaction_id, transaction_name, amount, currency_code}` |
| POST | `/v1/receipts/notices/seen` | any | `{ids}`. Mark them told |
| GET | `/v1/ai/settings` | any | Read agent settings |
| PATCH | `/v1/ai/settings` | admin+ | Update custom instructions and response language (CHAT-10) |

### `POST /v1/ai/chat/stream` body

```json
{ "session_id": "clx…", "message": "How much did I spend on food last month?", "attachment_ids": [] }
```

Answers `text/event-stream`. Protocol in [AI service](../ai/service.md#streaming-protocol).

### `POST /v1/ai/receipt/parse` body

```json
{ "vault_file_id": "clx…" }
```

The same reasoning as the statement route: the image is uploaded through the vault first and named here (D69). Answers the draft, what the ladder scored it, and what arithmetic replaced:

```json
{ "data": {
    "vault_file_id": "clx…",
    "draft": { "merchant": "Warung Tekko", "date": "2026-11-02", "currency": "IDR",
               "subtotal": "80000.0000", "tax": "7500.0000", "total": "87500.0000",
               "line_items": [ { "name": "Iga bakar", "amount": "45000.0000",
                                 "quantity": "1", "unit_price": "45000.0000" } ] },
    "quality": {
      "score": 62,
      "low_confidence_fields": ["date"],
      "corrected_fields": [ { "field": "total", "model_value": "8750" } ]
    }
} }
```

Nothing is persisted (AI-2). `low_confidence_fields` is the ladder's own report of what it was unsure of; `corrected_fields` names what [cross-field consistency](../ai/service.md#cross-field-consistency) replaced by arithmetic in Rust. They are different claims and the confirmation sheet renders them differently (AI-11).

Each correction carries `model_value`, the figure the model read, so the sheet can show it beside the computed one. AI-11 asks that the user see which numbers the model gave and which the code fixed, and a field name on its own says a figure changed without saying from what. `model_value` is `null` when the model gave nothing and the arithmetic supplied the field outright, which reads differently and is a different thing. An item-level fix marks `line_items` rather than an index, because the sheet shows every item at once.

An image with neither a readable total nor a readable date answers `RECEIPT_UNREADABLE` (422), and the sheet offers manual entry with the file already attached (AI-3).

## Integrations

The Apps page's routes (D83). Each acts on the caller's own Telegram link in the token's workspace; none names another member. The bot itself needs no route: the API long-polls Telegram (D84).

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/v1/integrations/telegram` | any | `{ enabled, bot_username, linked, telegram_username, linked_at }` |
| POST | `/v1/integrations/telegram/link-token` | any | `{ deep_link, expires_at }`: a one-time `t.me` link, ten minutes (D85). `TELEGRAM_DISABLED` when no bot is configured |
| POST | `/v1/integrations/telegram/unlink` | any | 204. Ends the caller's link and tells the chat; ending none is not an error |

## MCP

[features/mcp.md](../features/mcp.md), D106. Tokens belong to the person, so these take the session and any role.

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/v1/mcp` | MCP token | One JSON-RPC message, relayed by the app's `/mcp`. `data` is the JSON-RPC response, or null for a notification. A refused token is `MCP_TOKEN_INVALID` (401) |
| GET | `/v1/mcp/tokens` | any | The person's live personal access tokens |
| POST | `/v1/mcp/tokens` | any | `{ name, workspace_ids: string[] \| null, expires_in_days: 30 \| 90 \| 365 \| null }`. 201 with the token's view and `secret`, shown once |
| DELETE | `/v1/mcp/tokens/{id}` | any | Revoke one of the person's tokens |
| GET | `/v1/mcp/connections` | any | The person's OAuth grants, one row per grant |
| DELETE | `/v1/mcp/connections/{id}` | any | Disconnect an app: revokes every rotation of the grant |
| POST | `/v1/oauth/register` | none | RFC 7591 registration: `{ client_name, redirect_uris }`. `data` is the client, or `{ error, error_description }` that the app's `/oauth/register` sends with a 400 |
| GET | `/v1/oauth/clients/{id}` | any | Name and registered redirect URIs, for the consent page |
| POST | `/v1/oauth/authorize` | any | After consent: `{ client_id, redirect_uri, code_challenge, code_challenge_method: "S256", workspace_ids }` returns `{ code }` |
| POST | `/v1/oauth/token` | none | `grant_type` `authorization_code` (`code`, `redirect_uri`, `code_verifier`, `client_id`) or `refresh_token` (`refresh_token`, `client_id`). `data` is `{ access_token, token_type, expires_in, refresh_token, scope }` or an RFC 6749 error |

The public OAuth URLs are the app's (`/.well-known/oauth-*`, `/oauth/register`, `/oauth/token`, `/oauth/authorize`); these routes are what they relay to, over OWE1.

## Internal

Service-to-service only. Gated by `x-api-key`, bound to the internal network, never routable from the internet (OPS-6). Called by the AI service.

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/v1/internal/tools/execute` | service | Execute one named tool. Enforces role, writes an audit row (CHAT-4) |

One route, not three. An earlier draft also gave the AI service a context endpoint and a message endpoint; neither was built, because neither is needed. The workspace's wallets and categories travel in the turn body the API already sends (CHAT-7), and the API persists both halves of a turn itself, around the call. Every extra internal route is another door into the only process with a database connection, so the ones that buy nothing do not exist (D3).

### `POST /v1/internal/tools/execute` body

```json
{
  "workspace_id": "clx…",
  "user_id": "clx…",
  "role": "admin",
  "session_id": "clx…",
  "turn_id": "clx…",
  "tool": "create_transaction",
  "args": { "type": "expense", "amount": "50000.0000", "wallet_id": "clx…", "name": "Lunch" }
}
```

Everything a tool takes is inside `args`, including `delete_transaction`'s `confirmed`. There is no top-level flag: a confirmation belongs to one call of one tool, and a field beside `tool` would read as something the request carries whatever it is asking for.

The body carries the workspace context explicitly because the AI service holds no user JWT (D4). The API trusts the service key for the fact that the call comes from the AI service, and re-checks the `role` against the stored membership row before executing: the role in the body is a claim, not a fact (CHAT-4, [AI safety](../security/ai-safety.md#layer-1-authorization)).

`turn_id` is required. The API mints one id per user turn in `begin_turn` and sends it to the AI service with the turn; the AI service echoes it unchanged on every tool call belonging to that turn. The API refuses a `turn_id` it did not mint. This is the same reasoning as the `role` field above: a value the caller states about itself is a claim, and a service that minted its own id per call would start every call with an untouched budget and evade every cap (D68, [blast radius](../security/ai-safety.md#layer-2-blast-radius)).

Per-turn blast-radius caps are enforced here, not in the prompt, and they are counted against the `turn_id`: at most 3 write calls, 1 delete and 3 transactions created per turn, plus an amount ceiling set by `CHAT_MAX_TOOL_AMOUNT` (SEC-23, SEC-24, D25).

Response:

```json
{
  "data": { "ok": true, "result": { "id": "clx…" }, "summary": "Created expense 50,000 in Cash." },
  "error": null,
  "meta": { "request_id": "01JC0…" }
}
```

A refused call answers with `TOOL_FORBIDDEN`, `TOOL_ARGS_INVALID`, `TOOL_CAP_EXCEEDED` or `CONFIRMATION_REQUIRED` in the standard error envelope. The AI service relays the refusal to the user as plain text; it does not retry.

`CONFIRMATION_REQUIRED` is the one refusal that carries data the assistant needs. Its `fields` map holds the target row's description, so the assistant can quote the row back and ask rather than describing a delete it cannot see:

```json
{
  "data": null,
  "error": {
    "code": "CONFIRMATION_REQUIRED",
    "message": "This delete needs confirmation.",
    "hint": "Ask the user to confirm, then call again.",
    "fields": {
      "date": "2026-11-02",
      "name": "Warung Tekko",
      "amount": "50000.0000",
      "wallet": "Cash"
    },
    "request_id": "01JC0…"
  },
  "meta": { "request_id": "01JC0…" }
}
```

## Related docs

- [API conventions](conventions.md)
- [Auth and access control](../security/auth.md)
- [Data model](../data-model.md)
- [Transactions](../features/transactions.md) and [chat](../features/chat.md)
- [AI service](../ai/service.md)
