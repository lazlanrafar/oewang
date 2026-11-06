# API Conventions

Status: draft v0.1, 2026-11-02. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md) OPS-4 and OPS-5.

Every endpoint follows this page. If an endpoint needs an exception, the exception is written here first. The route catalog is in [endpoints](endpoints.md). The Rust implementation rules are in [Rust API best practices](../best-practices/rust-api.md).

## Update this doc when

- Changing the response envelope or the error object.
- Adding an error code. Add it to the [catalog](#error-catalog).
- Changing pagination, headers, rate limits or encoding rules.

## Summary

- REST over HTTPS, JSON, base path `/v1`.
- Every response body, success or error, uses the same envelope: `{ "data", "error", "meta" }`. All three keys are always present.
- Errors carry a stable `code`, a plain-language `message`, an optional `hint`, optional `fields`, and the `request_id`.
- Messages are English. Clients switch on `code`, never on text (UI-1).
- Filters, search, sort and page are query parameters, using the same names the web app uses in its own URLs (TXN-9).
- Money is a string. Dates are ISO 8601 strings. Never a JavaScript number (D12).
- **The envelope is what you get after decryption.** On the wire, bodies and query strings are encrypted with OWE1 (D22, [payload encryption](encryption.md)). Everything below describes the plaintext.

## The envelope

Success:

```json
{
  "data": { "id": "clx7f2…", "amount": "50000.0000", "type": "expense" },
  "error": null,
  "meta": { "request_id": "01JC0…" }
}
```

List success:

```json
{
  "data": [ { "id": "clx7f2…" } ],
  "error": null,
  "meta": {
    "request_id": "01JC0…",
    "page": 1,
    "limit": 25,
    "total": 1043,
    "total_pages": 42
  }
}
```

Error:

```json
{
  "data": null,
  "error": {
    "code": "WALLET_NOT_FOUND",
    "message": "Wallet not found in this workspace.",
    "hint": "Reload your wallets and pick one that still exists.",
    "fields": null,
    "request_id": "01JC0…"
  },
  "meta": { "request_id": "01JC0…" }
}
```

Validation error, with per-field detail:

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Some fields are invalid.",
    "hint": "Fix the listed fields and try again.",
    "fields": {
      "amount": "Must be greater than zero.",
      "to_wallet_id": "Required when type is transfer."
    },
    "request_id": "01JC0…"
  },
  "meta": { "request_id": "01JC0…" }
}
```

The web app maps `code` to a dictionary key and renders that. It never renders `message` directly to the user (UI-1). `message` and `hint` exist for developers, logs and agents.

## Resources and URLs

- Base path `/v1`. Internal, service-to-service routes live under `/v1/internal`.
- Resources are plural nouns: `/v1/transactions`, `/v1/wallets`.
- The workspace is never in the path. It comes from the JWT (AUTH-4). `/v1/transactions` means "transactions of the workspace this token is scoped to".
- Sub-resources nest one level at most: `/v1/transactions/{id}/items/{item_id}`.
- Actions that are not CRUD use a verb segment on the collection: `/v1/transactions/export`, `/v1/transactions/bulk`, `/v1/auth/switch-workspace`.

## Methods and status codes

| Method | Use | Success status |
|---|---|---|
| `GET` | Read | 200 |
| `POST` | Create, or a non-CRUD action | 201 on create, 200 on an action, 202 when work continues asynchronously |
| `PATCH` | Partial update | 200 |
| `PUT` | Full replace, used only for line items | 200 |
| `DELETE` | Soft delete | 204, no body |

| Status | When |
|---|---|
| 400 | Malformed request, unparseable body |
| 401 | Missing, malformed or expired token |
| 403 | Valid token, insufficient role |
| 404 | Not found, or found in another workspace (VLT-4) |
| 409 | A rule forbids the state change (last owner, wallet in use) |
| 413 | Upload over the size limit |
| 415 | Unsupported media type |
| 422 | Semantically invalid, including a model that cannot parse an input |
| 429 | Rate limited |
| 500 | Unhandled. Never leaks internals; the `request_id` ties it to the log line |

A row belonging to another workspace returns 404, not 403. 403 would confirm the row exists.

## Error catalog

Codes are stable, SCREAMING_SNAKE_CASE, and never reused for a different meaning.

### Auth and tenancy

| Code | Status | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No token, malformed token, or expired token |
| `INVALID_CREDENTIALS` | 401 | Wrong email or wrong password. Deliberately not specific (AUTH-5) |
| `INSUFFICIENT_ROLE` | 403 | The role in the token cannot perform this action |
| `EMAIL_TAKEN` | 409 | Registration with an existing address |
| `NOT_A_MEMBER` | 403 | Workspace switch to a workspace the user does not belong to |
| `LAST_OWNER` | 409 | Removing or demoting the only owner (WS-4) |
| `INVITE_INVALID` | 404 | Unknown, already accepted, or expired invite token |

### Validation and general

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 422 | One or more fields are invalid. See `fields` |
| `MALFORMED_REQUEST` | 400 | Body could not be parsed |
| `NOT_FOUND` | 404 | Resource does not exist in this workspace |
| `RATE_LIMITED` | 429 | Too many requests. `Retry-After` header is set |
| `INTERNAL_ERROR` | 500 | Unhandled failure |

### Wallets and categories

| Code | Status | Meaning |
|---|---|---|
| `WALLET_NOT_FOUND` | 404 | Unknown wallet in this workspace |
| `WALLET_HAS_TRANSACTIONS` | 409 | Delete blocked, live transactions reference it (WAL-4) |
| `CATEGORY_NOT_FOUND` | 404 | Unknown category in this workspace |

### Transactions

| Code | Status | Meaning |
|---|---|---|
| `TRANSACTION_NOT_FOUND` | 404 | Unknown transaction |
| `TRANSFER_REQUIRES_DESTINATION` | 422 | `type` is `transfer` and `to_wallet_id` is missing (TXN-7) |
| `TRANSFER_SAME_WALLET` | 422 | Source and destination wallet are the same |
| `DESTINATION_NOT_ALLOWED` | 422 | `to_wallet_id` set on a non-transfer |
| `TRANSFER_AMOUNT_REQUIRED` | 422 | `to_amount` missing on a transfer, or set on a non-transfer (TXN-18) |
| `WALLET_CURRENCY_LOCKED` | 409 | Changing a wallet's currency once it has a live transaction (WAL-6) |
| `WORKSPACE_CURRENCY_LOCKED` | 409 | Changing the workspace currency once any transaction exists (WAL-6) |
| `WORKSPACE_CURRENCY_CHANGED` | 409 | A transaction write whose rate was resolved before a currency conversion committed. Retry (D105) |
| `MCP_TOKEN_INVALID` | 401 | An MCP token that is unknown, revoked or expired (D106) |
| `FX_RATE_UNAVAILABLE` | 503 | No rate could be resolved: the source did not answer and no cached rate has ever existed for this pair. The user may still enter one by hand (TXN-22) |
| `RESET_TOKEN_INVALID` | 404 | Unknown, expired or already used password reset token |
| `AMOUNT_NOT_POSITIVE` | 422 | `amount` is zero or negative (TXN-2) |
| `IMPORT_JOB_NOT_FOUND` | 404 | Unknown import job |

### Files

| Code | Status | Meaning |
|---|---|---|
| `FILE_TOO_LARGE` | 413 | Over 10 MB (VLT-1) |
| `UNSUPPORTED_FILE_TYPE` | 415 | Not JPEG, PNG, WebP or PDF |
| `FILE_NOT_FOUND` | 404 | Unknown file in this workspace |
| `THUMBNAIL_UNAVAILABLE` | 404 | The file exists but no preview can be made from it (a PDF, or bytes that do not decode) (D91) |

### Transport

Only these are returned in plaintext, because the caller may have no working key. They carry no user data. Full list and client behaviour in [payload encryption](encryption.md#errors).

| Code | Status | Meaning |
|---|---|---|
| `CRYPTO_SESSION_UNKNOWN` | 401 | Unknown or expired crypto session |
| `CRYPTO_DECRYPT_FAILED` | 400 | Tag check failed or malformed message |
| `CRYPTO_REPLAY_DETECTED` | 400 | Request ID already seen |
| `CRYPTO_CLOCK_SKEW` | 400 | Timestamp outside the 120 second window |
| `CRYPTO_QUERY_NOT_ENCRYPTED` | 400 | Plaintext query string on a protected route |
| `CRYPTO_VERSION_UNSUPPORTED` | 400 | Unknown protocol version |
| `TRANSPORT_UNEXPECTED_RESPONSE` | n/a | Client-side: the response was neither OWE1 nor a plaintext crypto error |

### Chat and AI

| Code | Status | Meaning |
|---|---|---|
| `SESSION_NOT_FOUND` | 404 | Unknown chat session |
| `AI_UNAVAILABLE` | 503 | The AI service did not answer |
| `RECEIPT_UNREADABLE` | 422 | The model could not extract a receipt from the image (AI-3) |
| `STATEMENT_UNREADABLE` | 422 | The model could not extract rows from the statement |
| `EXTRACTION_NO_ANSWER` | 503 | Every extraction pass timed out, failed or answered out of shape, so the document was never read. Retry; do not ask for a better photo |
| `TOOL_NOT_FOUND` | 400 | The AI service called a tool that does not exist |
| `TOOL_ARGS_INVALID` | 422 | Tool arguments failed schema validation |
| `TOOL_FORBIDDEN` | 403 | The caller's role cannot run this tool (CHAT-4) |
| `CONFIRMATION_REQUIRED` | 409 | A destructive tool was called without confirmation (CHAT-6). `fields` carries the target row's description: `date`, `name`, `amount`, `wallet` |
| `TOOL_CAP_EXCEEDED` | 409 | A per-turn blast-radius cap was reached (D25). The model reports it and stops; it does not retry |

### Integrations

| Code | Status | Meaning |
|---|---|---|
| `TELEGRAM_DISABLED` | 503 | The server runs without a Telegram bot (`TELEGRAM_BOT_TOKEN` unset) |

## Encoding rules

| Kind | Wire format | Example |
|---|---|---|
| Money | String, 4 decimal places, no separators, no symbol | `"50000.0000"` |
| Date and time | ISO 8601 with offset | `"2026-11-02T09:30:00+08:00"` |
| Date only | ISO 8601 date | `"2026-11-02"` |
| ID | CUID2 string | `"clx7f2k9p0001…"` |
| Enum | Lowercase snake_case string | `"expense"` |
| Null | `null`, never an empty string | |

A client that parses money into a floating point number is a bug, in any language (D12).

## Pagination

- Page based: `?page=1&limit=25`. `limit` defaults to 25 and is capped at 100.
- `meta` carries `page`, `limit`, `total`, `total_pages`.
- Sorting: `?sort=date&order=desc`. Allowed sort fields are listed per endpoint in [endpoints](endpoints.md).
- Filters are flat query parameters, matching the web app's own URL parameters so a shared link reproduces the view (TXN-9).

## Headers

| Header | Direction | Use |
|---|---|---|
| `Authorization: Bearer <jwt>` | in | Every route except `/health` and `/v1/auth/{register,login}`. Stays outside the encrypted body |
| `x-api-key` | in | Only on `/v1/internal/*`, from the AI service (OPS-6) |
| `X-Owe-Session` | in | The crypto session ID ([encryption](encryption.md#messages)) |
| `X-Owe-Request-Id` | in and out | A ULID, unique per message. Doubles as the envelope's `request_id` |
| `X-Owe-Timestamp` | in | Unix seconds, within 120 seconds of server time |
| `X-Owe-Query` | in | The encrypted query string. Required even when empty |
| `Idempotency-Key` | in | Optional on create endpoints. A repeat within 24 hours returns the first result |
| `Retry-After` | out | Set on 429 |

## Rate limits

Per IP address, enforced at the API (OPS-5).

| Scope | Limit |
|---|---|
| `/v1/auth/*` | 10 requests per 15 minutes |
| Authenticated routes | 300 requests per minute |
| Unauthenticated routes | 30 requests per minute |
| `/v1/internal/*` | Not IP limited; gated by the service key |

Exceeding a limit returns `RATE_LIMITED` with `Retry-After`.

## Streaming

`POST /v1/ai/chat/stream` is the only streaming endpoint. It answers `text/event-stream`, not the JSON envelope. Its event protocol is specified in [AI service](../ai/service.md#streaming-protocol), and each event is sealed individually ([chat stream events](encryption.md#chat-stream-events)). Errors raised before the stream opens use the normal envelope; errors raised after it opens arrive as an `error` event inside the stream.

## Idempotency

- `GET` and `DELETE` are idempotent by nature. Deleting an already-deleted row returns 204.
- `POST` creates accept `Idempotency-Key`. The key, the route and the caller's workspace form the cache key, held for 24 hours.
- `PATCH` is last-write-wins. There is no optimistic concurrency header; the only contended rows are wallet balances, and those are protected by row locks, not by the client (D13).

## Related docs

- [Docs index](../README.md) and [PRD](../prd.md)
- [API endpoints](endpoints.md)
- [Auth and access control](../security/auth.md)
- [Data model](../data-model.md)
- [Rust API best practices](../best-practices/rust-api.md)
- [AI service](../ai/service.md)
