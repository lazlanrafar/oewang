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
| GET | `/v1/auth/me` | any | Current user, workspace and role |
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
| GET | `/v1/workspaces/current` | any | The current workspace |
| PATCH | `/v1/workspaces/current` | admin+ | Update name, slug, country. Currency code only while no transaction exists, otherwise `WORKSPACE_CURRENCY_LOCKED` (WAL-6) |
| GET | `/v1/workspaces/current/members` | any | Members with role and join date |
| DELETE | `/v1/workspaces/current/members/{user_id}` | admin+ | Remove a member. `LAST_OWNER` if it is the only owner (WS-4) |
| PATCH | `/v1/workspaces/current/members/{user_id}` | admin+ | Change a member's role. Same `LAST_OWNER` rule |
| GET | `/v1/workspaces/current/invites` | admin+ | Pending invites |
| POST | `/v1/workspaces/current/invites` | admin+ | Invite by email with a role (WS-3) |
| DELETE | `/v1/workspaces/current/invites/{id}` | admin+ | Revoke an invite |
| POST | `/v1/workspaces/accept-invite` | any | Accept an invite by token |
| DELETE | `/v1/workspaces/current` | owner | Soft-delete the workspace |

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
| GET | `/v1/wallets` | any | List with balances in each wallet's own currency, grouped. Query: `include_deleted=false` |
| GET | `/v1/wallets/{id}` | any | One wallet |
| POST | `/v1/wallets` | admin+ | Create. `currency_code` optional, defaults to the workspace currency (WAL-5) |
| PATCH | `/v1/wallets/{id}` | admin+ | Update name, group, sort order, totals flag. Currency only while the wallet has no live transaction, otherwise `WALLET_CURRENCY_LOCKED` (WAL-6) |
| POST | `/v1/wallets/{id}/set-default` | admin+ | Make default, clearing the previous default in the same transaction (WAL-3) |
| DELETE | `/v1/wallets/{id}` | admin+ | Soft delete. `WALLET_HAS_TRANSACTIONS` if any live transaction references it (WAL-4) |

Balance is never writable through the API. It changes only as a consequence of a transaction (TXN-3). A manual correction is recorded as an income or expense transaction, like any other movement.

## Exchange rates

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/v1/fx/rate` | any | Rate for a currency pair on a date, for prefilling the form. Query: `from`, `to`, `date` (TXN-20) |

The response is a suggestion. The rate the user confirms is sent back on the transaction and stored there (D39). No read path consults this endpoint, because `base_amount` was computed at write time, so a report is a plain sum.

## Categories

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/v1/categories` | any | List. Query: `type=income|expense` |
| POST | `/v1/categories` | admin+ | Create |
| PATCH | `/v1/categories/{id}` | admin+ | Update name, type or sort order |
| DELETE | `/v1/categories/{id}` | admin+ | Soft delete. Sets `category_id` to null on its transactions (CAT-2) |

## Transactions

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/v1/transactions` | any | Paginated list (TXN-8) |
| GET | `/v1/transactions/summary` | any | Totals by category, wallet and type for a date range |
| GET | `/v1/transactions/export` | any | CSV download honouring the active filters (TXN-10) |
| POST | `/v1/transactions` | admin+ | Create. Adjusts wallet balances (TXN-3) |
| POST | `/v1/transactions/bulk` | admin+ | Create many. Used by the CSV wizard commit (TXN-11) |
| POST | `/v1/transactions/bulk-update` | admin+ | Update many: category, ready flag (TXN-14) |
| POST | `/v1/transactions/bulk-delete` | admin+ | Soft-delete many, reversing each balance (TXN-14) |
| POST | `/v1/transactions/import` | admin+ | Upload a statement image or PDF. Returns `202 {job_id}` (AI-4) |
| POST | `/v1/transactions/import/map-columns` | admin+ | Column names plus two sample rows in, a proposed mapping out (AI-9). Proxies the AI service, because the browser never calls it directly (PLT-4) |
| GET | `/v1/transactions/import/{job_id}` | any | Poll an import job: status plus imported, skipped and duplicate counts (AI-6) |
| GET | `/v1/transactions/{id}` | any | One transaction with items and attachments |
| GET | `/v1/transactions/{id}/history` | any | Audit history for this transaction: actor, surface, before and after, newest first (OPS-8) |
| PATCH | `/v1/transactions/{id}` | admin+ | Update. Re-applies the balance delta (TXN-4) |
| DELETE | `/v1/transactions/{id}` | admin+ | Soft delete. Reverses the balance (TXN-5) |

### `GET /v1/transactions` query parameters

| Parameter | Type | Notes |
|---|---|---|
| `wallet_id` | string | Matches `wallet_id` or `to_wallet_id` |
| `category_id` | string | |
| `type` | enum | `income`, `expense`, `transfer` |
| `start_date` | date | Inclusive |
| `end_date` | date | Inclusive |
| `search` | string | Matches `name` or `description`, case insensitive |
| `is_ready` | boolean | |
| `sort` | enum | `date` (default), `amount`, `created_at` |
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
  "is_ready": true,
  "attachment_ids": ["clx…"],
  "items": [
    { "name": "Nasi goreng", "quantity": "1", "unit_price": "35000.0000", "amount": "35000.0000" }
  ]
}
```

`items` and `attachment_ids` are optional. Both are synced inside the same database transaction as the transaction insert.

## Transaction line items

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/v1/transactions/{id}/items` | any | Line items for a transaction |
| POST | `/v1/transactions/{id}/items` | admin+ | Add one |
| PUT | `/v1/transactions/{id}/items/{item_id}` | admin+ | Replace one |
| DELETE | `/v1/transactions/{id}/items/{item_id}` | admin+ | Soft delete one |

Line items do not affect wallet balances. Only the parent transaction's `amount` does (TXN-12).

## Files

Bytes travel through the API in encrypted chunks, not through a signed object-storage URL (D23, [file bytes](encryption.md#file-bytes)).

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/v1/vault/files` | admin+ | Begin an upload: `{filename, content_type, size_bytes}`. Returns `{id, chunk_size, chunk_count, status:"pending"}` (VLT-1) |
| PUT | `/v1/vault/files/{id}/chunks/{index}` | admin+ | Send one 512 KiB chunk as `{"data":"<base64>"}` |
| POST | `/v1/vault/files/{id}/complete` | admin+ | Verify every chunk, record the SHA-256, set status `ready` |
| GET | `/v1/vault/files/{id}` | any | Metadata |
| GET | `/v1/vault/files/{id}/chunks/{index}` | any | One chunk back, `{index, data}` (VLT-3, as revised by D23) |
| DELETE | `/v1/vault/files/{id}` | admin+ | Soft delete |

The declared `content_type` is checked against the bytes sniffed from chunk 0 at completion. A mismatch fails the upload with `UNSUPPORTED_FILE_TYPE` (SEC-12).

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
| GET | `/v1/ai/settings` | any | Read agent settings |
| PATCH | `/v1/ai/settings` | admin+ | Update custom instructions and response language (CHAT-10) |

### `POST /v1/ai/chat/stream` body

```json
{ "session_id": "clx…", "message": "How much did I spend on food last month?", "attachment_ids": [] }
```

Answers `text/event-stream`. Protocol in [AI service](../ai/service.md#streaming-protocol).

## Internal

Service-to-service only. Gated by `x-api-key`, bound to the internal network, never routable from the internet (OPS-6). Called by the AI service.

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/v1/internal/context` | service | Workspace wallets and categories for the system prompt (CHAT-7) |
| POST | `/v1/internal/tools/execute` | service | Execute one named tool. Enforces role, writes an audit row (CHAT-4) |
| POST | `/v1/internal/messages` | service | Persist a chat message |

### `POST /v1/internal/tools/execute` body

```json
{
  "workspace_id": "clx…",
  "user_id": "clx…",
  "role": "admin",
  "session_id": "clx…",
  "tool": "create_transaction",
  "args": { "type": "expense", "amount": "50000.0000", "wallet_id": "clx…", "name": "Lunch" },
  "confirmed": false
}
```

The body carries the workspace context explicitly because the AI service holds no user JWT (D4). The API trusts the service key for the fact that the call comes from the AI service, and re-checks the `role` against the stored membership row before executing: the role in the body is a claim, not a fact (CHAT-4, [AI safety](../security/ai-safety.md#layer-1-authorization)).

Per-turn blast-radius caps are enforced here, not in the prompt: at most 3 write calls, 1 delete and 3 transactions created per turn, plus a configurable amount ceiling (SEC-23, SEC-24, D25).

Response:

```json
{
  "data": { "ok": true, "result": { "id": "clx…" }, "summary": "Created expense 50,000 in Cash." },
  "error": null,
  "meta": { "request_id": "01JC0…" }
}
```

A refused call answers with `TOOL_FORBIDDEN`, `TOOL_ARGS_INVALID` or `CONFIRMATION_REQUIRED` in the standard error envelope. The AI service relays the refusal to the user as plain text; it does not retry.

## Related docs

- [API conventions](conventions.md)
- [Auth and access control](../security/auth.md)
- [Data model](../data-model.md)
- [Transactions](../features/transactions.md) and [chat](../features/chat.md)
- [AI service](../ai/service.md)
