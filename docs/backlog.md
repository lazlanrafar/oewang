# Backlog

Status: draft v0.1, 2026-11-02. Part of the [oewang docs](README.md). Every story maps to requirement IDs from the [PRD](prd.md#6-requirements).

Fifty-six stories in ten milestones. Each is sized for one focused session. A story is done when every acceptance criterion is checked, not when the code compiles.

## Update this doc when

- A story is finished, split, or dropped.
- A requirement gains a story, or a story changes scope.

## Conventions

- **UI stories** always carry "verify in browser" as a criterion. A screenshot in a pull request is not verification.
- **API stories** always carry a typecheck or clippy criterion and at least one test.
- A story that cannot be finished in one session is split before it is started, not during.

---

## M0. Foundation

### US-001: Scaffold the monorepo
Requirements: PLT-1, PLT-5

- [x] `apps/app` (SvelteKit, TypeScript, Tailwind 4), `apps/api` (cargo workspace), `apps/ai` (FastAPI, uv) all build
- [x] `infra/docker-compose.yml` starts PostgreSQL 16 and MinIO
- [x] `.env.example` lists every variable from [architecture](architecture.md#configuration) with a comment
- [x] Root `README.md` documents install and run for all three apps
- [x] `cargo check`, `bun run check` and `ruff check` all pass, run in the containers

### US-002: Database schema and migrations
Requirements: all data requirements, OPS-2

- [x] One sqlx migration per logical group: auth, workspace, wallet, transaction, vault, ai, audit
- [x] Every table and column from [data model](data-model.md#tables-in-scope)
- [x] Every index, including the partial `WHERE deleted_at IS NULL` ones and the partial unique default-wallet index
- [x] `sqlx migrate run` succeeds against an empty database
- [x] A seed command creates a demo workspace with wallets, categories and about 200 transactions
- [x] `cargo sqlx prepare` succeeds so the build works offline

### US-003: Axum skeleton, errors, config, logging
Requirements: PLT-2, OPS-3, OPS-4, SEC-19

- [x] `/health` and `/health/ready` return correctly
- [x] Config is read from the environment and fails fast on a missing required variable
- [x] `AppError` maps every variant to one code and one status ([conventions](api/conventions.md#error-catalog))
- [x] Middleware: request ID, trace, timeout (30 s), body limit (1 MB), catch-panic, compression
- [x] Structured JSON logging; a secret newtype prints `[redacted]`
- [x] Database pool configured with the limits in [hardening](security/hardening.md#limits)
- [x] `cargo clippy --all-targets -- -D warnings` passes

### US-004: OWE1 protocol and test vectors
Requirements: SEC-2, SEC-3, SEC-4

- [x] `domain::owe1`: key derivation, the handshake transcript, every associated-data string
- [x] Ed25519 signing key loaded from a file; created with mode `0600` in development
- [x] `GET /.well-known/oewang-keys` publishes public keys with their key IDs
- [x] `POST /v1/handshake` establishes a session and signs the transcript
- [x] Test vectors written to `owe1-vectors.json`: a handshake, a sealed request, a sealed response, a sealed stream event
- [x] Unit tests cover a low-order public key, a bad version and a malformed nonce

### US-005: OWE1 middleware and the two clients
Requirements: SEC-1, SEC-5, SEC-6, SEC-7

- [x] Axum middleware decrypts the query header and the body, and encrypts the response, binding the status
- [x] Replay protection: a 120 second timestamp window and a 5 minute request-ID LRU
- [x] The four plaintext exceptions, and only those, bypass the middleware
- [x] Node client in `apps/app/src/lib/server/owe1/`, passing the shared vectors in Vitest
- [x] Python client and server middleware in `apps/ai`, passing the shared vectors in pytest
- [x] An integration test drives the Node client and the Python client against a live Rust API
- [x] A replayed request returns `CRYPTO_REPLAY_DETECTED`; a flipped ciphertext bit returns `CRYPTO_DECRYPT_FAILED`

### US-006: SvelteKit shell, design tokens, i18n
Requirements: UI-1, UI-3, UI-6

- [x] Tailwind 4 theme carries the colour tokens and radii from the old `packages/ui/globals.css`
- [x] shadcn-svelte installed; button, input, sheet, dialog, table, dropdown, badge, toast generated
- [x] Dashboard layout renders the sidebar and topbar matching the old shell
- [x] Dark mode toggles and persists
- [x] `src/lib/i18n/en.json` plus the typed `t()` helper and the generated key union; shell strings resolve through it
- [x] The layout works at 375 px with no horizontal scroll
- [x] Verify in browser

---

## M1. Accounts

### US-007: Register and login API
Requirements: AUTH-1, AUTH-2, AUTH-5, WS-5

- [x] `POST /v1/auth/register` creates user, workspace and an `owner` membership in one transaction
- [x] Argon2id hashing runs under `spawn_blocking`; the hash is never in a response type
- [x] `POST /v1/auth/login` returns a JWT, or `INVALID_CREDENTIALS`
- [x] An unknown email performs a dummy verification so timing matches a wrong password
- [x] Seed defaults created for a new workspace (CAT-3)
- [x] Unit tests: success, wrong password, unknown email, duplicate email

### US-008: JWT extractor and role guard
Requirements: AUTH-4, WS-1, WS-2

- [x] An `Auth` extractor rejects a missing, malformed or expired token with 401
- [x] `workspace_id` and `role` come only from claims; a body-supplied `workspace_id` is ignored
- [x] `RequireRole` returns `INSUFFICIENT_ROLE` for a `member` on a write route
- [x] A write path re-reads the membership row rather than trusting the token snapshot
- [x] `POST /v1/auth/switch-workspace` re-scopes the token, or returns `NOT_A_MEMBER`
- [x] Tests cover every rejection path

### US-008b: Refresh rotation and revocation
Requirements: AUTH-7, AUTH-8, AUTH-9

- [x] `refresh_tokens` table with `token_hash`, `family_id`, `used_at`, `revoked_at`
- [x] Login issues a 15 minute access token and a 30 day opaque refresh token; only the SHA-256 is stored
- [x] `POST /v1/auth/refresh` rotates: new pair issued, old row marked used
- [x] Reusing a rotated token revokes the whole family and returns 401
- [x] Logout revokes the row; logout-all revokes every live row for the user
- [x] A password change or reset revokes every live row
- [x] The SvelteKit client refreshes transparently on a 401 and retries the original request once
- [x] `GET /v1/auth/sessions` lists live sessions with user agent and last use
- [x] Tests: rotation, reuse detection, expiry, revocation on password change

### US-009: Login and register UI
Requirements: AUTH-3, UI-1, UI-7

- [x] `/login` and `/register` ported from the old auth screens
- [x] Form actions call the API and set `oewang-session` with the attributes in [auth](security/auth.md#the-session-cookies)
- [x] `hooks.server.ts` redirects an unauthenticated request from `(dashboard)` to `/login`
- [x] Field errors render inline; API codes map through the dictionary
- [x] Both forms work with JavaScript disabled
- [x] Verify in browser

### US-010: Workspace members and invites
Requirements: WS-3, WS-4

- [x] Every route in [endpoints](api/endpoints.md#workspaces-and-members), with role gates
- [x] An invite creates a token row; accepting adds a membership row
- [x] The last owner cannot be removed or demoted: `LAST_OWNER`
- [x] Settings page lists members with role, an invite form and a remove action (ticked before the page existed; built in US-058)
- [x] Verify in browser

### US-010b: Password reset
Requirements: AUTH-10, AUTH-6

- [x] `password_reset_tokens` table, SHA-256 stored, 1 hour expiry, single use
- [x] `POST /v1/auth/forgot-password` always answers 204, so it cannot enumerate users
- [x] The email goes through Resend from a DNS-verified sender (D40)
- [x] `POST /v1/auth/reset-password` validates the token, sets the new hash, marks it used, revokes every session
- [x] An expired, used or unknown token returns `RESET_TOKEN_INVALID`
- [x] Both pages built: request a reset, set a new password
- [x] Rate limited with the rest of `/v1/auth/*`
- [x] The token never appears in a log line
- [x] Verify in browser

---

## M2. Ledger

### US-011: Wallets and wallet groups API
Requirements: WAL-1, WAL-2, WAL-3, WAL-4, WAL-5, WAL-6

- [x] CRUD for both, workspace-scoped, soft delete, audit logged
- [x] A wallet carries `currency_code`, defaulting to the workspace currency when the client omits it (WAL-5)
- [x] `set-default` clears the previous default in the same transaction; the partial unique index backs it
- [x] Deleting a wallet with live transactions returns `WALLET_HAS_TRANSACTIONS`
- [x] Balance is not writable through any route
- [x] Changing a wallet's currency once it has a live transaction returns `WALLET_CURRENCY_LOCKED`; changing the workspace currency once any transaction exists returns `WORKSPACE_CURRENCY_LOCKED` (WAL-6)
- [x] Tests cover the default invariant, the delete guard and both currency locks

### US-012: Categories API
Requirements: CAT-1, CAT-2

- [x] CRUD, workspace-scoped, type restricted to income or expense
- [x] Deleting a category nulls `category_id` on its transactions
- [x] Tests cover the null-out behaviour

### US-013: Wallets and categories settings UI
Requirements: WAL-1, CAT-1, UI-5

- [x] Settings manages wallets grouped, with create, edit, reorder and set default
- [x] Categories in a separate tab, split by type
- [x] Each wallet balance renders in that wallet's own currency, with correct precision; a group total renders in the workspace currency
- [x] Verify in browser

The wallet half of this story moved out in US-013b, and the Settings wallets tab was removed with it. The criteria above stay ticked because they describe what was built and shipped; Settings keeps the categories tab and the assistant tab. Reordering and group CRUD had no UI left anywhere after the move, which US-013b records as open work.

Since D82 the categories tab is two settings sections, `/settings/income-category` and `/settings/expense-category`, one type each, and the assistant tab is `/settings/assistant`. `/settings?tab=assistant` and `?tab=wallets` still land on the right page.

### US-013b: Accounts page
Requirements: WAL-1, WAL-2, WAL-3, WAL-4, WAL-5, WAL-6, UI-1, UI-6, UI-8

- [x] `/accounts` owns creating, renaming, grouping, setting the default and deleting a wallet. The Settings wallets tab is removed, so one screen owns each write (WAL-1, WAL-3, WAL-4)
- [ ] Three cards above the table: the workspace-currency total, the account count, and how many are counted in totals. The third counts `is_included_in_totals`, which is what the total is a total of, not the live app's "Active"
- [ ] A foreign wallet converts at today's rate; a wallet with no rate is left out and the card says how many were left out
- [ ] Columns as measured on the live page: name 200 sticky left with a star on the default, group 150 as an in-cell select, balance 150 right aligned, created taking the remainder, actions 90. Row height 45, shared with the transactions table through `molecules/data-table/columns.ts` (WAL-2, UI-5)
- [ ] Each balance renders in its own wallet's currency and precision; every total renders in the workspace currency
- [ ] A form sheet creates and edits an account, with no balance field: an opening figure is a transaction, not a column write (TXN-3)
- [ ] The currency field is locked once the account has a live transaction, and a locked save does not blank the column (WAL-6)
- [ ] A detail sheet edits one account in place: name on submit, group and the totals flag on change, balance on blur
- [ ] Typing a balance posts `POST /v1/wallets/{id}/adjust`, which records one "Balance adjustment" transaction for the difference. A target equal to the current balance writes nothing
- [ ] Every mutation is a form action, so the page works with JavaScript off
- [ ] A `member` sees the page with no add button, no group select and View alone in the row menu
- [ ] Search and the group filter live in the URL and are applied on the server, so a filtered view can be shared and restored (UI-8)
- [ ] Every string on the screen resolves through `en.json`; no literals in markup (UI-1)
- [ ] The page is usable at 375 px, with the cards stacking and the table scrolling inside its own box (UI-6)
- [ ] Unit tests cover `walletTotals`: only flagged wallets count, a foreign wallet converts, and the wallets left out for want of a rate are reported
- [ ] Rust tests cover the adjustment: up writes one income, down writes one expense, an unchanged target writes nothing, a foreign wallet lands on its target in its own currency, and a `member` is refused
- [ ] Verify in browser
- [ ] Group create, rename and delete reach the screen. The actions are on the page and nothing calls them; the Settings tab that used to do it is gone
- [ ] A wallet's `sort_order` can be set again. The settings reorder went with the tab, so the list orders by a column no screen writes

### US-014: Transaction list API
Requirements: TXN-8, SEC-9, SEC-10, SEC-18

- [x] Every filter in [endpoints](api/endpoints.md#get-v1transactions-query-parameters)
- [x] Wallet and category names joined in the same query, no N+1
- [x] Pagination meta correct; `limit` capped at 100
- [x] Sort maps an enum to a fixed fragment; the search filter binds its `LIKE` pattern as a parameter (SEC-9)
- [x] Soft-deleted rows never appear
- [x] A 10,000 row workspace returns page 1 under 100 ms locally

### US-015: Create transaction with balance update
Requirements: TXN-1, TXN-2, TXN-3, TXN-6, TXN-7, TXN-15, TXN-18, TXN-19, OPS-1

- [x] Balance rules applied inside one database transaction
- [x] Wallet rows locked with `FOR UPDATE` in ascending ID order
- [x] Every validation rule from [transactions](features/transactions.md#validation), including `to_amount` on a transfer (TXN-18)
- [x] An audit row written in the same transaction, with `source: "web"`
- [x] A `member` is refused on create, update and delete (TXN-15)
- [x] Unit tests for income, expense, transfer and each validation failure
- [x] A concurrency test: two parallel creates against one wallet give the exact final balance

### US-016: Update and delete transaction
Requirements: TXN-4, TXN-5

- [x] `PATCH` reverses the old effect and applies the new one atomically
- [x] All nine type transitions, plus changed amount, wallet and destination, recompute correctly
- [x] `DELETE` soft-deletes and reverses
- [x] Both write audit rows with `before` and `after`
- [x] Unit tests cover every transition and the delete

### US-017: Transaction table UI
Requirements: TXN-8, TXN-9, UI-2, UI-6, UI-8

- [x] The old column set, widths, sticky columns and resizing. TanStack Table is deliberately absent (see [transactions](features/transactions.md#data-table-what-is-built-and-what-is-not))
- [x] Column visibility, sorting and row selection
- [x] Filter bar: search, date range, wallet, category, type, ready flag
- [x] Filter state in URL search parameters, surviving reload
- [x] Separate empty states for "none yet" and "none matching"
- [x] Usable at 375 px
- [x] Verify in browser

### US-018: Transaction form sheet
Requirements: TXN-1, TXN-7, UI-2, UI-5, D12

- [x] Ported from `transaction-form-sheet.tsx`
- [x] Type toggle changes the visible fields; transfer reveals the destination wallet
- [x] The amount value is a string end to end, never a JavaScript number
- [x] Works without JavaScript, through a form action and a `<noscript>` form sharing one field set. Superforms and Zod are not used: the project validates in the API and maps codes through the dictionary, and a second validation layer would be a second place for a rule to live
- [x] On success the sheet closes, the list refreshes, a toast confirms
- [x] Verify in browser

### US-018b: Wallet currencies and foreign entry
Requirements: WAL-5, WAL-6, TXN-18, TXN-19, TXN-20, TXN-21, TXN-22

- [x] `wallets.currency_code`, not null, defaulting to the workspace currency. A workspace that never touches it behaves exactly as before
- [x] Both currency locks enforced, each with its own error code
- [x] `exchange_rates` cache table with a unique index on pair and date
- [x] A daily job pulls rates from exchangerate.host into `exchange_rates`, for every wallet-currency to workspace-currency pair in use (D44; now one APILayer snapshot a day, every pair read through it, D96)
- [x] `GET /v1/fx/rate` returns a suggestion for the form
- [x] Write-time resolution in order: same, request, live, newest cache, then `FX_RATE_UNAVAILABLE` only when no cached rate has ever existed (TXN-22)
- [x] `base_rate_source` and `base_rate_date` are stored on every row
- [x] A row written on a stale cached rate is marked in the list and the detail sheet, naming the rate and its date
- [x] Tests cover all five resolution steps, including the source being down with a warm cache and with no cache at all
- [x] The form shows a currency selector beside the amount. Picking a currency other than the wallet's reveals an editable rate field and shows the converted figure live
- [x] A cross-currency transfer captures both legs: `amount` out of the source, `to_amount` into the destination
- [x] `base_amount` and `base_rate` are computed by the service and rejected if sent by the client
- [x] Summaries sum `base_amount` with no conversion at read time
- [x] The list renders the wallet-currency amount as the primary figure, with the original beside it, muted, when the entry currency differed. A single-currency row renders one line (TXN-21)
- [x] The detail sheet shows all three figures plus both rates
- [x] Wallet balances render in each wallet's own currency; totals and charts render in the workspace currency
- [x] Unit tests cover the four worked examples in [data model](data-model.md#worked-examples), including a same-currency transfer where `to_amount` equals `amount`
- [x] A test asserts changing today's rate does not move a historical total
- [x] Verify in browser

### US-019: Transaction detail sheet
Requirements: TXN-12, TXN-13, UI-4, OPS-8

- [x] Full detail, line items and attachments
- [x] Attachment bytes are fetched as encrypted chunks and shown from a Blob URL revoked after load; no object-storage URL is used (D23)
- [x] Edit and delete visible to `admin+`, hidden for `member`
- [x] Delete asks for confirmation
- [x] A history section lists audit entries newest first: actor, surface, and what changed (OPS-8)
- [x] `GET /v1/transactions/{id}/history` is workspace-scoped and readable by any member
- [x] Verify in browser

### US-020: Bulk actions
Requirements: TXN-14, SEC-18

- [x] Selection shows the bulk bar, ported from `transaction-bulk-edit-bar.tsx`
- [x] Bulk category change, ready toggle and delete
- [x] The API applies a bulk change in one database transaction, capped at 500 rows
- [x] Bulk delete confirms, and reverses every affected balance
- [x] Verify in browser

### US-021: CSV export
Requirements: TXN-10

- [x] `GET /v1/transactions/export` streams CSV honouring the active filters
- [x] Columns match the old export; amounts are unformatted decimals
- [x] Exported rows marked `is_exported`
- [x] The export modal picks a date range and triggers the download
- [x] Verify in browser

### US-022: CSV import wizard with AI column mapping
Requirements: TXN-11, TXN-16, TXN-23, AI-9, SEC-18

- [x] Four steps, ported from the old wizard
- [ ] XLSX. CSV, semicolon and tab files are parsed in the browser. Still not built, and still deliberately: the only npm build of SheetJS carries a known prototype-pollution advisory and it would run in the browser, in the same context as the session. Reconfirmed 2026-11-03. The owner takes this one or it stays out
- [x] Prefilled step 2. `POST /v1/transactions/import/map-columns` now proxies the AI service (US-029 landed the hop). The step still works entirely by hand when the call fails, times out or maps nothing, which is the path that matters
- [x] The mapping call failing or timing out leaves the step empty and the wizard still works by hand
- [x] Rows are transformed in Rust. A test asserts no amount is ever sent to the model
- [x] Split debit and credit columns map correctly, with the sign rule in code
- [x] A fingerprint is computed per row; an existing fingerprint counts as a duplicate, not an error
- [x] A row whose currency differs from the wallet's converts with the rate for that row's own date (TXN-23)
- [x] A row with no rate for its date is skipped and reported separately from rows skipped for invalid data
- [x] Commit calls `POST /v1/transactions/bulk`; balances update for every committed row
- [x] Row-level errors shown and skipped, never failing the whole import
- [x] Capped at 5,000 rows per import
- [x] The review step shows created, duplicate and skipped counts separately
- [x] Verify in browser

---

## M3. Files

### US-023: Chunked upload and storage
Requirements: VLT-1, VLT-2, VLT-3, VLT-4, SEC-8, SEC-12, SEC-13

- [x] Begin, chunk, complete and chunk-download routes ([endpoints](api/endpoints.md#files))
- [x] A `Storage` trait with a local filesystem implementation and an S3 implementation (D19)
- [x] Download is chunk-by-chunk through the API. No signed object-storage URL exists anywhere in the codebase (VLT-3, D23)
- [x] Type sniffed from the bytes and checked against the declared type; SVG and HTML rejected
- [x] The storage key is generated, never derived from the filename
- [x] Size capped at 10 MB; the body limit rejects an oversized chunk before the handler reads it
- [x] A cross-workspace request returns 404
- [x] Tests: type rejection, size rejection, cross-workspace isolation, a renamed executable

### US-024: Attach files to transactions
Requirements: TXN-13, VLT-5

- [x] `attachment_ids` on create and update sync the join rows
- [x] The form sheet has a dropzone with upload progress
- [x] Removing an attachment soft-deletes the join row, not the file
- [x] Verify in browser

### US-025: Transaction line items
Requirements: TXN-12

- [x] Item routes implemented
- [x] The detail sheet shows an editable item table
- [x] A warning badge when the item total does not match the transaction amount; not blocked
- [x] Verify in browser

---

## M4. Assistant

### US-026: Python service skeleton
Requirements: PLT-3, SEC-1

- [x] FastAPI with `/health`, the service-key middleware and per-caller rate limiting
- [x] Anthropic client configured from the environment
- [x] OWE1 middleware and client wired, passing the shared vectors
- [x] No `DATABASE_URL` is read anywhere; a test asserts the service starts without one
- [x] A Rust client in `crates/clients` with timeout and retry
- [x] pytest green with a mocked model

### US-027: Chat sessions API and history UI
Requirements: CHAT-1, CHAT-8

- [x] Session CRUD, workspace-scoped, soft delete
- [x] The chat page lists sessions newest first, ported from `chat-history.tsx`
- [x] Selecting a session loads its messages server-side
- [x] Rename and delete from the list, with confirmation on delete
- [x] Verify in browser

CHAT-8's generated title needs a first user message, so the title call itself
lands with the stream (US-028). What exists here is the stored title, its
default and its rename.

### US-028: Streaming chat without tools
Requirements: CHAT-2, CHAT-9, SEC-7

- [x] `POST /chat/stream` emits sealed `token` and `done` events
- [x] The API pipes the stream through and persists both messages
- [x] SvelteKit pipes it to the browser with no buffering
- [x] Tokens render incrementally; Markdown renders after the stream ends, sanitized
- [x] Aborting stops generation and persists the partial reply
- [ ] First token under 2 seconds with encryption on. Measured at about 2.4 s. Encryption is not the cost: the gateway's `free-main` injects roughly 3.6k tokens of its own system prompt ahead of ours. A faster model behind `AI_BASE_URL` is a configuration change (D67), so this is the owner's call, not more code. See [Q12](prd.md#10-open-questions)
- [x] Verify in browser

First token measured at 2.35 seconds end to end through all three hops. The
encryption is not what costs it: the gateway prepends its own system prompt,
which made the turn 3,600 input tokens before ours were counted (D67). The
criterion stands open against the model actually configured, and is a model
choice rather than a code change.

### US-029: Tool execution endpoint
Requirements: CHAT-4, CHAT-15, AI-8, SEC-23, SEC-24, SEC-25, OPS-1

- [x] `POST /v1/internal/tools/execute` dispatches all eleven tools
- [x] Every returned number is computed, rounded and formatted by the API. A test asserts no tool returns a raw figure the model would have to combine
- [x] `get_spending_summary` returns the comparison with the previous period and a direction label, both precomputed
- [x] Results are a compact projection, not a database row
- [x] A list over the byte budget is truncated with `truncated: true` and `has_next_page: true`
- [x] Arguments validated against the schema before execution
- [x] The `role` in the body is re-checked against the membership row
- [x] Per-turn caps enforced: 3 writes, 1 delete, 3 creates, an amount ceiling
- [x] Delete confirmation scoped to one transaction ID, expiring after 5 minutes, not honoured unchallenged
- [x] Every write produces an audit row with `source: "chat"` attributed to the real user
- [x] Tests cover each tool's happy path, its role refusal and each cap

### US-030: Tool loop
Requirements: CHAT-3, CHAT-5, CHAT-6, CHAT-7

- [x] The loop runs with the eleven tools, capped at 8 rounds
- [x] The system prompt carries wallets and categories, sent in the turn body by the API
- [x] `tool_call` and `tool_result` events stream and render as collapsible cards
- [x] "Add a 50,000 lunch expense from my Cash wallet" creates the transaction and the list shows it
- [x] A delete needs a confirmation turn
- [x] A refusal is relayed, never retried
- [x] Verify in browser

### US-031: Chat input and message UI
Requirements: UI-2, UI-7, CHAT-11, CHAT-14, SEC-11

- [x] Input ported from `chat-input.tsx`: auto-grow, Enter to send, Shift and Enter for a newline, attachment button, stop button
- [x] Messages ported from `chat-messages.tsx`: role styling, copy, regenerate
- [x] Assistant Markdown sanitized with an allow-list; links to external hosts render as text
- [x] Entity links (`#txn:`, `#wallet:`, `#cat:`, `#file:`, `#navigate:`) render as buttons that open the sheet, the canvas or a route
- [x] Tool calls render as human labels with a derived fallback for unlabelled tools
- [x] One finished call shows a check; several collapse to "Used N tools", expandable; the in-flight one shimmers
- [x] Assistant text arriving before the last tool call is suppressed while tools are still running
- [x] Suggestion chips on an empty session
- [x] Verify in browser

### US-031b: Chat write invalidation
Requirements: CHAT-12

- [x] A tool-name to invalidation map, deduplicated by tool call ID
- [x] A transaction write invalidates the list, the detail, the summary, wallet balances and the overview
- [x] A wallet or category write invalidates the lists and the transaction filter options
- [x] Creating a transaction in chat, then switching to the transaction page, shows it without a manual reload
- [x] Verify in browser

### US-032: Chat settings
Requirements: CHAT-10

- [x] `GET` and `PATCH /v1/ai/settings` read and write custom instructions and response language
- [x] Custom instructions reach the system prompt on the next turn
- [x] The settings page exposes both fields
- [x] Verify in browser

---

## M5. Capture

### US-033: Receipt parsing and consistency fixes
Requirements: AI-1, AI-3, AI-7, SEC-21

- [x] `POST /receipt/parse` returns merchant, date, total, currency and line items
- [x] **The call passes no tools at all**; a test asserts the tool list is empty
- [x] `POST /v1/ai/receipt/parse` uploads to the vault, calls the service and returns the draft plus the file ID
- [x] Cross-field consistency runs in Rust: items sum to subtotal, subtotal plus tax equals total, unit price times quantity equals item amount, date is real, currency is valid ISO 4217
- [x] A suggested fix is applied and the field is marked as corrected
- [x] Nothing is persisted as a transaction
- [x] An unreadable image returns `RECEIPT_UNREADABLE`, not a 500
- [x] Three receipt fixtures with known totals and dates, plus one fixture whose stated total is deliberately wrong and must be corrected by arithmetic

This story runs the single primary model. The ladder is US-033b, so the flow is working before it is optimized.
### US-033b: Extraction quality ladder
Requirements: AI-10, AI-11

- [x] `calculateQualityScore` as a pure function with the weights in [the ladder](ai/service.md#quality-score). Unit tested with no model
- [x] Pass 1 runs `AI_VISION_PRIMARY` and returns immediately when the score reaches `AI_QUALITY_THRESHOLD`
- [x] Pass 2 runs the secondary model with a chain-of-thought prompt, or the tertiary when pass 1 scored below half the threshold
- [x] Results merge per the stated rules, including the close-confidence field rules for total, date, merchant and line items
- [x] Pass 3 re-extracts only the invalid fields, one targeted prompt per field, capped at 4 calls
- [x] A failed pass never aborts the ladder; pass 2 failing falls through to pass 3
- [x] The call cap and the 45 second budget each stop the ladder and return a marked result, not an error
- [x] `RECEIPT_UNREADABLE` only when `total` and `date` are both absent after pass 4
- [x] The response carries `quality.score`, `low_confidence_fields` and `corrected_fields`
- [x] A clean fixture makes exactly one model call; a poor fixture escalates. Both asserted against a scripted client
- [x] Per-extraction logging: pass reached, model per pass, score per pass, fields re-extracted, duration
- [x] The same ladder serves `/import/extract`
### US-034: Receipt confirmation and the canvas
Requirements: AI-2, UI-2, CHAT-13

- [x] A side panel component driven by URL parameters (`?canvas=…&id=…`), surviving reload
- [x] The panel mounts the real confirmation sheet and the real transaction form, not a separate rendering
- [x] The conversation column animates its margin so it reflows beside the panel; full width below the medium breakpoint
- [x] Uploading from chat or from the transaction page opens the panel
- [x] Every parsed field is editable; corrected fields are visibly marked, and low confidence fields are flagged for the user to check (AI-11)
- [x] The wallet defaults to the workspace default; a matching category is preselected
- [x] Confirming creates the transaction with its items and the receipt attached
- [x] Cancelling leaves the file and creates nothing
- [x] The assistant writes one sentence and does not repeat the draft contents in text
- [ ] Verify in browser

### US-035: AI statement import
Requirements: AI-4, AI-5, AI-6, TXN-16, TXN-17, SEC-18, SEC-21

- [x] `POST /v1/transactions/import` creates a job row and returns `202 {job_id}`
- [x] A PDF carrying a text layer is parsed deterministically first; vision is the fallback (D42)
- [x] A tokio task calls `/import/extract`, which also passes no tools, then creates rows one by one
- [x] Each row gets a fingerprint; an existing one counts as a duplicate
- [x] A failed row counts as skipped and does not abort the job
- [x] Imported, skipped and duplicate counts written back on completion; capped at 5,000 rows
- [x] A job `pending` past 10 minutes reports as stale and the modal offers a retry
- [x] A failed job keeps its uploaded file, so a retry does not re-upload
- [ ] Re-importing the same statement twice creates nothing the second time
- [x] The modal polls every 2 seconds and shows the review screen
- [ ] Verify in browser

---

## M6. Hardening

### US-036: Limits, headers, secrets
Requirements: PLT-4, AUTH-6, OPS-5, OPS-6, SEC-14 to SEC-19

- [x] Every rate limit and size limit from [hardening](security/hardening.md#limits), as configuration with those defaults
- [x] CSP, HSTS, `nosniff`, referrer policy, permissions policy and `frame-ancestors 'none'` on every HTML response
- [x] CORS allows nothing (SEC-16)
- [x] The chat turn limit holds: the 21st turn in a minute for one workspace is refused (SEC-17)
- [x] A test asserts no browser-reachable code path calls the API or the AI service directly (PLT-4)
- [x] Internal routes reject a request without a valid service key, compared in constant time
- [x] A header snapshot test, so a loosened CSP shows up in review (SEC-15)
- [x] A test asserts no secret value appears in captured logs

### US-037: AI safety test corpus
Requirements: SEC-21 to SEC-26

- [x] Every case in [AI safety testing](security/ai-safety.md#testing) implemented
- [x] A receipt carrying an injected instruction produces no tool call from the extraction path
- [x] Document text reaches the tool-capable loop only inside a labelled block, never as an unreviewed tool argument (SEC-22)
- [x] A `member` write attempt is refused and reported
- [x] An unchallenged `confirmed: true` is rejected, and a confirmation token cannot move between IDs
- [x] Each blast-radius cap has a test
- [x] Model output containing an HTML event handler is sanitized before rendering

### US-038: Test suite and CI
Requirements: OPS-7, SEC-20

- [x] `cargo test` covers services and repositories against a test database
- [x] `pytest` covers the tool loop with a mocked model
- [x] Vitest covers the app's pure modules and the OWE1 client vectors
- [x] Playwright covers log in, create a transaction, and a chat message that creates a transaction
- [x] An axe pass on the three main screens
- [x] GitHub Actions runs lint, typecheck, tests and the three audit tools for all apps on every push
- [ ] The whole run finishes under 5 minutes. Not met and not pretended otherwise: the Rust job is the long pole at an estimated 4 to 6 minutes warm and 10 to 14 cold, because the workspace compiles three times over (the sqlx cache check, clippy, the tests). The levers, cheapest first: a larger runner for that job alone, `cargo nextest`, `sccache`. Dropping `--all-targets` from clippy would be fastest and was rejected, because it stops linting the tests
- [ ] Deployment targets Coolify on the existing VPS, with files in Cloudflare R2 (D41). [deployment.md](deployment.md) documents it in full and lists what is still undecided (domains, the Coolify project, the R2 bucket, who holds the signing keys, backups). Deploying is the owner's call, and production images do not exist yet: only `Dockerfile.dev` per app

### US-039: Documentation pass
Requirements: all

- [x] Every doc in [the index](README.md#all-documents) reflects what was built
- [x] Each feature doc's "Update this doc when" list is accurate
- [x] `docs/ENV_VARS.md` generated from the running configuration
- [x] `CLAUDE.md` at the root points at the index and states the layer rules
- [ ] Every requirement ID in the [PRD](prd.md#6-requirements) has a passing test or a browser-verified story, or is listed as not done with a reason. `scripts/coverage.py` proves all 141 are named by a story and runs in CI; the stronger half, that each is actually exercised, waits on the browser pass below


---

## M7. Telegram

Added by D83. [Telegram](features/telegram.md) is the feature doc.

### US-040: Link a Telegram chat
Requirements: TG-1, TG-2, TG-3, TG-4, TG-9, TG-10

- [x] `0009_telegram.sql`: `telegram_links`, `telegram_link_tokens`, `telegram_updates`, and `telegram` added to both `source` checks
- [x] The API polls `getUpdates` from one task when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` are set, and starts without it when neither is; one without the other refuses to start
- [x] Each update is claimed by id before it is handled; one chat's updates run in order
- [x] `GET /v1/integrations/telegram`, `POST …/link-token` and `POST …/unlink`, any member, the caller's own link only
- [x] `/start <token>` links a private chat to the token's member: once, within ten minutes, refused for a bot account, a group chat, a used or expired token, the old app's `slug___user` payload, or a member who has left
- [x] One live link per member per workspace and per chat; signing out everywhere, resetting the password, removing the member and `/disconnect` end it. Linking, unlinking from the Apps page and `/disconnect` write a `telegram_link` audit row; the other three are recorded by the action that caused them
- [x] The bot token never reaches a log line: the client's `Debug` omits it and every `reqwest` error is stripped of its URL
- [x] Apps page: search and All/Connected in the URL, the Telegram card, the details sheet (`?app=telegram`), the connect dialog with a server-drawn QR code, and disconnect behind a confirmation
- [x] clippy, `cargo test` (the link tests in `telegram/tests.rs`), `bun run check`
- [ ] Verify in browser and in Telegram with a real bot

### US-041: Receipts from Telegram
Requirements: TG-5, TG-6, TG-7, AI-2, AI-11

- [x] A photo, or a JPEG, PNG, WebP or PDF document, goes through the vault service, `parse_receipt` and `create_with_items` with `source = 'telegram'`
- [x] No readable total: nothing is saved and the user is asked for a sharper photo. No date: saved as today and flagged
- [x] The account is the default one holding the receipt's currency, else the first that does; none holds it: nothing is saved and the user is told why
- [x] `POST /receipt/categorize` (AI service) picks one expense category by exact name with `tools=[]`; the API keeps it only on an exact match
- [x] The reply matches the format in [Telegram](features/telegram.md#the-reply), with this month's totals from the summary query
- [x] Category buttons recategorise and rewrite the message; Delete asks once more, then soft-deletes. Every tap re-reads the link, the sender and the role, and looks the ids up in the link's workspace
- [x] A member sees a refusal and nothing is saved
- [x] Unit tests for the reply format, the button data, and categorize (pytest)
- [ ] Verify with a real receipt: the transaction, its items and its attachment in the web app, and the totals equal to the dashboard's

### US-042: The assistant in Telegram
Requirements: TG-8, TG-10, CHAT-4, CHAT-6, CHAT-9

- [x] Text goes to the link's own conversation through `begin_turn`, the turn budget and the stream pump, and the reply is collected and sent as plain text, split under 4096 characters
- [x] The turn carries `channel: "telegram"`; the AI service then asks for plain text with no tables and no entity links, and the web prompt is unchanged (golden test)
- [x] The per-workspace chat limit applies
- [ ] Verify in Telegram: a question answered from the workspace's data, and a delete that asks before it happens

## M8. Overview and the analysis canvas

Added by D87, D88 and D89. [Overview](features/overview.md) and [chat](features/chat.md#canvas) are the feature docs.

### US-043: The overview API
Requirements: OVR-2, OVR-3, CHAT-15

- [x] `GET /v1/overview?from&to`, any member, workspace from the token: income, expense and net with the previous equal-length period, zero-filled months, monthly averages, top six categories per type plus "Other"
- [x] One report module (`server/src/reports`) owns the arithmetic for the overview and the three canvases; every raw figure has a `_formatted` twin
- [x] `monthly_totals` in the repository filters by `workspace_id` and `deleted_at IS NULL`; a range is at most 60 months
- [x] Tests: range arithmetic, workspace scope, soft delete, zero-fill, shares (`reports/tests.rs`)

### US-044: The overview page
Requirements: OVR-1, OVR-2, OVR-3, OVR-4, OVR-5, UI-8

- [x] `/` redirects to `/overview`; the sidebar entry is live
- [x] Greeting, range picker and the two tabs, all in the URL
- [x] Six cards on the overview tab, each a question for the assistant; seven prompt chips; five charts on the metrics tab
- [x] The floating composer starts a session, opens it and the conversation sends the question once
- [x] The load declares `app:overview`, `app:summary` and `app:wallet-balances`
- [x] Chart molecules (`molecules/chart`) with specimens on `/design-system`
- [x] Verified in the browser: cards, comparisons, metrics charts, a chip starting a conversation

### US-045: Analysis artifacts
Requirements: CHAT-3, CHAT-16, CHAT-18, CHAT-15

- [x] `get_spending_analysis`, `get_income_summary`, `get_burn_rate` in the Rust validator and the Python catalog, read-only, `from` and `to` required
- [x] The tool request carries `call_id`; the API keeps the artifact in the turn store under it, eight at most per turn
- [x] The stream pump sends `artifact` after the tool's result, records it on the tool call, and drops any `artifact` from upstream
- [x] An empty range leaves no artifact; the model's result says `canvas: false`
- [x] The prompt tells the model to answer in one to three sentences after an analysis tool (golden file)
- [x] Tests: turn store hand-over and bound, pump injection and persistence, artifacts per tool, the last day of a range counted

### US-046: The chat restyle and canvas tabs
Requirements: CHAT-17, CHAT-19, CHAT-13, UI-8

- [x] Header with back, title and new chat; centred column; floating composer with the history list behind its button
- [x] An `artifact` event opens the canvas once per call; tabs between a conversation's analyses; a toggle on each message that made one
- [x] `?canvas=spending|income|burn-rate&id=<call id>` survives reload; an unknown id says so
- [x] Vitest: artifact frames, stored artifacts, canvas kinds, handoff
- [x] Verified in the browser: a chip from the overview opens the spending canvas while the answer streams, and a reload keeps it
- [x] Composer and history as the old app's: one-line field, add / shortcuts / history toolbar, `/` menu with the fourteen answerable shortcuts, thumbnails, drop anywhere, fold on scroll; history on the overview too, through the `(assistant)` route group
- [x] The Assistant sidebar entry is gone; conversations start from the overview
- [x] Verified in dark mode; donut slices take their colours from the theme
- [ ] Verify at phone width

## M9. Vault and usage

Added by D90, D91 and D92. [Vault](features/vault.md) and [usage](features/usage.md) are the feature docs.

### US-047: Vault API and thumbnails
Requirements: VLT-6, VLT-8, VLT-9, VLT-10, VLT-11, VLT-12, VLT-4

- [x] `0010_vault_usage.sql`: `vault_files.tags` and `vault_files.thumbnail`
- [x] `GET /v1/vault/files`, any member: search (`%` and `_` escaped), type, size band, tag, five sorts, paged; only ready, live files of the token's workspace, each with `used_by`
- [x] `GET /v1/vault/files/{id}` adds tags, thumbnail, `used_by` and the newest 20 linked transactions, amounts as decimal strings
- [x] `PATCH /v1/vault/files/{id}`, write role: the name cleaned like an upload filename; tags trimmed, deduplicated case-insensitively, at most 10 of at most 32 characters, refused rather than cut; audited as `file.updated`
- [x] `DELETE` soft-deletes the file's live attachment rows in the same database transaction, audited with `{"detached": n}`; the chunks and the preview go after commit
- [x] `GET /v1/vault/files/{id}/thumbnail`: made on first request in `spawn_blocking`, 8000px and 128 MB limits, EXIF orientation, 320x320 JPEG at quality 80, stored at `{key}/thumb`; a PDF or undecodable bytes answer `THUMBNAIL_UNAVAILABLE` and are never retried
- [x] Tests: tag normalisation (`domain/src/files.rs`); in `vault/tests.rs`, workspace scope and `used_by`, search wildcards, rename and retag with the audit row, detach on delete, one preview kept, a PDF marked, no preview across a workspace
- [x] clippy, `cargo test` and `cargo sqlx prepare` pass in the containers

### US-048: Vault page and file sheet
Requirements: VLT-6, VLT-7, VLT-8, VLT-9, VLT-10, VLT-11, UI-8

- [x] "Vault" in the sidebar's Workspace group, before Apps
- [x] The old page copied: `h1` title and description, storage in the header, search, grid and list views; `?search`, `?view=grid|list` and `?file=<id>` in the URL
- [x] The grid loads 15 at a time and scrolls for more; a scrolled page is not in the URL
- [x] Dropping files anywhere on the page uploads them, with one toast for the batch
- [x] `organisms/vault/vault-file-sheet`: preview box, rename, date created, format and size, tags with suggestions and a custom input, linked transactions, "View full" with its menu, delete behind a confirmation that counts the transactions
- [x] File proxy routes under `/vault/files` (begin, chunks, complete, the JSON list, the thumbnail); writes post to `/vault?/update` and `/vault?/delete`
- [x] CSP `frame-src blob:` for the PDF frame, with the header snapshot test updated (SEC-15)
- [ ] Verify in browser: upload by drop, rename, tag, delete with a count, a PDF and an image preview, dark mode

### US-049: Tiles and the picker on transactions
Requirements: VLT-13, VLT-5, VLT-7, TXN-13

- [x] Molecules `file-icon`, `file-tile`, `file-card`, `file-picker` and `file-preview`; `file-dropzone` restyled to the old form sheet's attachments block; `attachment-view` deleted
- [x] Specimens on `/design-system` for the tile, card, picker, preview and dropzone
- [x] Button gains variant `outline-destructive` and size `caps`; Badge gains variant `tag`
- [x] Specimens for `file-icon` and for the three new atom variants (D81: a named variant has its own specimen)
- [x] The picker filters, searches and sorts on the server across every page, 12 per page, with no "Videos" filter and no orientation column; a picked file comes back whole
- [x] Form sheet: tiles plus the picker; a drop uploads straight to the vault
- [x] Detail sheet: the Attachments section open by default; a writer removes a tile or adds through the picker, and the change saves at once through `?/setAttachments`
- [x] An attachment tile opens the vault file sheet over the detail sheet (`?file=` on `/transactions`)
- [ ] Verify in browser: attach from the picker, remove a tile in the detail sheet, open a file over a transaction

### US-050: Usage tracking and the settings page
Requirements: USG-1, USG-2, USG-3

- [x] `ai_usage`, append-only, one row per model call
- [x] The AI service answers `usage: {input, output, model}` on every extraction route, summed across ladder passes, and `model` in the chat `done` event's usage
- [x] The API records through a `Meter` in `ai/extraction.rs` (receipt, import, columns, categorize) and a `TurnMeter` in the stream pump (chat or telegram); a failed record is logged and never fails the call
- [x] The column mapping answer is read as `{mapping, usage}`; it was read as a bare mapping, so AI column mapping always came back empty (unit test)
- [x] `GET /v1/workspaces/current/usage`, any member: storage from the rows, tokens this month (UTC) and all time, by feature, with the headline summed from the feature rows
- [x] `/settings/usage`, after Assistant: three stat cards and the by-feature table
- [x] Tests: the headline summed from the features, missing token fields read as zero, tokens clamped into the column (Rust); usage in each extraction response and the chat `done` event (pytest)
- [x] clippy, `cargo test`, `bun run check`, `ruff check` and `pytest` pass in the containers
- [ ] Verify in browser: a receipt parse and a chat turn each move the figures

---

### US-054: Database pages: currency rates and items
Requirements: FX-1, ITM-1, ITM-2

- [x] Sidebar group Database, below Settings: Currency rates and Items
- [x] `GET /v1/fx/rates`: the newest snapshot on or before `date`, every currency in the workspace currency and inverse, cross rates computed in `numeric` (Rust test)
- [x] `GET /v1/items` and `GET /v1/items/history`: items grouped by trimmed lowercased name and currency, price per purchase worked out in SQL, other workspaces and deleted transactions left out, `%` and `_` literal in search (Rust tests)
- [x] Both pages are standard list screens (D81): search, sort and page in the URL, two empty states, the shared table; the item sheet opens from `?item=`
- [x] Verified locally in the browser against real receipts and today's snapshot
- [x] Discount lines (negative amount) are not items; each purchase reports its receipt's discount sum, and the list marks an item whose latest receipt had one (Rust test)

### US-055: Currency picker on the rate snapshot
Requirements: FX-2

- [x] `GET /v1/fx/currencies`: every currency in the newest snapshot, the workspace's first at one (Rust test)
- [x] Loaded once by the dashboard layout into the workspace lists; `SelectCurrency` needs no list and shows each rate
- [x] Used by the transaction form, the receipt confirmation sheet, the account form and, inside the shell, the workspace form (the standalone page keeps its fixed list)
- [x] The transaction form prefills the entry rate (cross rates exact, `divideDecimals`) without overwriting a typed one, and suggests the base rate for the chosen wallet rather than only the default one
- [x] Wallet totals on the accounts page read the same snapshot in one call instead of one lookup per currency
- [x] Verified locally in the browser: USD picked, rate prefilled

### US-056: Brand green, user colours and error pages
Requirements: UI-9, UI-10

- [x] Primary is oewang.com's brand green, light and dark (D99)
- [x] `users.income_color` and `users.expense_color`, `PUT /v1/auth/me/colors`, audited, `#rrggbb` only (Rust tests)
- [x] Settings, Appearance: swatches, a free colour, default, live preview; applied to the shell on the server render and to the document root for portals (vitest)
- [x] `routes/+error.svelte` per status and `src/error.html` as the last resort (D101)
- [x] Verified locally in the browser: a colour saved and applied, then reset; the 404 page

## Coverage check

Run this before declaring a milestone finished: every requirement ID in [PRD section 6](prd.md#6-requirements) should appear in at least one story above. A requirement with no story is either out of scope and belongs in the non-goals, or it is a gap.

It is one command, `python3 scripts/coverage.py`, and CI runs it.

As of 2026-11-03 it reports none missing. UI-8 was the last gap: every screen
was built to it and `src/lib/url-state.ts` exists, but no story named it, which
is how a requirement ends up satisfied by habit rather than on purpose. It is
now listed under US-017.

## Related docs

- [Docs index](README.md) and [PRD](prd.md)
- [Architecture](architecture.md) and [data model](data-model.md)
- [Transactions](features/transactions.md), [accounts](features/accounts.md), [chat](features/chat.md), [vault](features/vault.md) and [usage](features/usage.md)
- [Hardening](security/hardening.md) and [AI safety](security/ai-safety.md)

## M10. Workspaces and account

### US-051: Workspace switcher and the workspaces page
Requirements: WS-1, WS-2, WS-6

- [x] The sidebar switcher is the old app's: cat tile, workspace over its role, a menu of workspaces with the current one ticked, Add workspace, Manage workspaces
- [x] Switching posts `/workspaces?/switch`, writes the new session into the cookies and reloads the page it came from
- [x] `POST /v1/workspaces`: owner membership, seeded categories, audit `workspace.created`, at most 10 owned (Rust tests)
- [x] `/workspaces` outside the shell: the list with the current one marked, a click switches, and the business-details form creates and switches
- [x] The switcher's "Add workspace" dialog posts the same action
- [x] Verify in browser: create a workspace, land in it, switch back

### US-052: The account area
Requirements: AUTH-11, AUTH-12, AUTH-13

- [x] `/account` outside the shell with its own sidebar (Profile, Password & sessions); Profile removed from the settings sidebar
- [x] The top bar's avatar menu: Account, Theme, Log out
- [x] `PATCH /v1/auth/me` renames and audits (Rust test)
- [x] `POST /v1/auth/change-password`: a wrong current password is a field error, never a 401; every other session ends and a fresh one is issued (Rust test)
- [x] `GET/PUT/DELETE /v1/auth/me/avatar`: sniffed, decoded under limits, stored as a 256px JPEG, removed after commit (Rust test); the browser shrinks a photo to 512px before sending it
- [x] Sessions listed; Sign out of all devices asks first
- [x] clippy, `cargo test`, `bun run check` and `bun run test` pass in the containers
- [ ] Verify in browser: change a password, sign out of all devices

### US-053: Receipts wait for the reader
Requirements: AI-12

- [x] A reader failure on the bot or the web queues the receipt instead of failing it; the bot says it will save it by itself, the web panel says the same and closes
- [x] `receipt_jobs` with one job per file; the loop claims due jobs with `SKIP LOCKED`, frees jobs a dead process held, backs off 1, 2, 5, 10, 30 minutes then hourly, gives up after 24 hours (Rust tests)
- [x] Read and save shared by the bot and the queue; a file already attached to a live transaction counts as saved
- [x] Telegram is answered in its chat when the job ends; the web shows a toast on the next page and marks it seen
- [x] Vault tiles and rows show *Pending* (hatched) or *Not read*
- [x] Verified locally: with the AI service stopped, a queued receipt stays pending and is rescheduled
- [x] Verify end to end: a receipt saved once the reader answers (production, 2026-11-05, after the `oewang-model` combo in 9router was moved to `cx/gpt-5.6-luna` → `cx/gpt-5.6-terra`; the queue path itself was verified locally up to rescheduling, not yet through to a save)

## M11. Budgets

### US-057: Budgets and the budget canvas
Requirements: BUD-1, BUD-2, BUD-3, BUD-4, BUD-5

- [x] `budgets` table with one live budget per category (migration 0014); create, edit limit, delete, each audited (Rust tests)
- [x] Spent sums live expenses in the month in `base_amount`; next month, last month, income, other categories, other workspaces and deleted rows are left out (Rust test)
- [x] Percent and state thresholds (79 safe, 80 and 100 warning, 101 over) and the summary sentence (Rust unit tests)
- [x] Deleting a category deletes its budget (Rust test)
- [x] `/budget` as the old page: cards, filter bar with a status facet, month stepper, sortable table, form sheet, delete confirm; Budget in the sidebar after Accounts
- [x] `get_budget_status` tool (Rust and Python catalogs, fifteen tools) and the `budget` canvas
- [x] Every list screen's search is the transactions filter bar, with facets: budgets (status), accounts (group, currency), items (currency), rates (search only)
- [x] clippy, `cargo test`, ruff, pytest, `bun run check` and `bun run test` pass in the containers
- [x] Verified locally: create a budget, figures match the database, October shows over budget in red, the month and filters survive a reload, the chat answers with the canvas and it survives a reload
- [ ] Verify in production after deploy

## M12. Workspace settings

### US-058: Members, Currency and Feedback in settings
Requirements: WS-3, WS-4, WAL-6, FB-1

- [x] Sidebar: Members, Currency and Feedback built; Display, Transaction, Backup and Passcode removed rather than left "Soon" (D104)
- [x] Accepting an invitation requires the invited address and never changes a live member's role; an admin cannot change or remove an owner; invite, revoke, join, role change and removal are audited (Rust tests)
- [x] Inviting a current member is refused; inviting again replaces the pending link (Rust test)
- [x] `/settings/members`: members and invitations tabs in the URL, filter bar with a role facet, invite sheet that shows the link once, role menu, remove and revoke confirms; read-only for members
- [x] `/accept-invite` accepts, switches into the workspace and opens the overview; anything else says why
- [x] `GET /v1/workspaces/current` returns `currency_locked`; `/settings/currency` changes the currency until the first transaction, then explains the lock
- [x] `feedback` table (migration 0015) and `POST /v1/feedback`, any role, audited (Rust tests); `/settings/feedback` form
- [x] clippy, `cargo test`, `bun run check` and `bun run test` pass in the containers
- [x] Verified locally: invite and copy the link, a wrong-address accept is refused and leaves the link usable, revoke keeps the Invitations tab, the locked currency explains itself, feedback lands in the table
- [ ] Verify locally: accept as the invited account, change a role, remove a member, change the currency of a workspace with no transactions
- [ ] Verify in production after deploy

### US-059: Convert the workspace currency
Requirements: WAL-6, WAL-7

- [x] Owner-only preview and convert endpoints; one rate reprices every transaction (deleted included) and every budget; a wallet already in the new currency takes rate 1; audited (Rust tests)
- [x] Transaction writes re-read the currency under a share lock and fail with `WORKSPACE_CURRENCY_CHANGED` after a conversion
- [x] `/settings/currency`: when locked, an owner picks the new currency (`?to=`), gets the newest stored rate to edit, a warning that all data will use this one rate, and a confirm that needs the new code typed
- [x] clippy, `cargo test`, `bun run check` and `bun run test` pass in the containers
- [x] Verified locally: the warning, the prefilled rate and counts, the confirm dialog (no conversion run on the real local workspace)
- [ ] Verify end to end on a throwaway workspace: convert, then check transactions, overview and budgets read in the new currency
- [ ] Verify in production after deploy

