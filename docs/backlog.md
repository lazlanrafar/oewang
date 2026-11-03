# Backlog

Status: draft v0.1, 2026-11-02. Part of the [oewang docs](README.md). Every story maps to requirement IDs from the [PRD](prd.md#6-requirements).

Forty-four stories in six milestones. Each is sized for one focused session. A story is done when every acceptance criterion is checked, not when the code compiles.

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
- [x] Settings page lists members with role, an invite form and a remove action
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
Requirements: TXN-8, TXN-9, UI-2, UI-6

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
- [x] A daily job pulls rates from exchangerate.host into `exchange_rates`, for every wallet-currency to workspace-currency pair in use (D44)
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
- [ ] XLSX. CSV, semicolon and tab files are parsed in the browser; a spreadsheet needs a dependency whose only npm build carries a known advisory, which is a call for the team rather than a default
- [ ] Prefilled step 2. The route exists and refuses with `AI_UNAVAILABLE`; the call needs the OWE1 client for the API-to-AI hop, which is US-026
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

- [ ] Session CRUD, workspace-scoped, soft delete
- [ ] The chat page lists sessions newest first, ported from `chat-history.tsx`
- [ ] Selecting a session loads its messages server-side
- [ ] Rename and delete from the list, with confirmation on delete
- [ ] Verify in browser

### US-028: Streaming chat without tools
Requirements: CHAT-2, CHAT-9, SEC-7

- [ ] `POST /chat/stream` emits sealed `token` and `done` events
- [ ] The API pipes the stream through and persists both messages
- [ ] SvelteKit pipes it to the browser with no buffering
- [ ] Tokens render incrementally; Markdown renders after the stream ends, sanitized
- [ ] Aborting stops generation and persists the partial reply
- [ ] First token under 2 seconds with encryption on
- [ ] Verify in browser

### US-029: Tool execution endpoint
Requirements: CHAT-4, CHAT-15, AI-8, SEC-23, SEC-24, SEC-25, OPS-1

- [ ] `POST /v1/internal/tools/execute` dispatches all eleven tools
- [ ] Every returned number is computed, rounded and formatted by the API. A test asserts no tool returns a raw figure the model would have to combine
- [ ] `get_spending_summary` returns the comparison with the previous period and a direction label, both precomputed
- [ ] Results are a compact projection, not a database row
- [ ] A list over the byte budget is truncated with `truncated: true` and `has_next_page: true`
- [ ] Arguments validated against the schema before execution
- [ ] The `role` in the body is re-checked against the membership row
- [ ] Per-turn caps enforced: 3 writes, 1 delete, 3 creates, an amount ceiling
- [ ] Delete confirmation scoped to one transaction ID, expiring after 5 minutes, not honoured unchallenged
- [ ] Every write produces an audit row with `source: "chat"` attributed to the real user
- [ ] Tests cover each tool's happy path, its role refusal and each cap

### US-030: Tool loop
Requirements: CHAT-3, CHAT-5, CHAT-6, CHAT-7

- [ ] The loop runs with the eleven tools, capped at 8 rounds
- [ ] The system prompt carries wallets and categories from `/v1/internal/context`
- [ ] `tool_call` and `tool_result` events stream and render as collapsible cards
- [ ] "Add a 50,000 lunch expense from my Cash wallet" creates the transaction and the list shows it
- [ ] A delete needs a confirmation turn
- [ ] A refusal is relayed, never retried
- [ ] Verify in browser

### US-031: Chat input and message UI
Requirements: UI-2, UI-7, CHAT-11, CHAT-14, SEC-11

- [ ] Input ported from `chat-input.tsx`: auto-grow, Enter to send, Shift and Enter for a newline, attachment button, stop button
- [ ] Messages ported from `chat-messages.tsx`: role styling, copy, regenerate
- [ ] Assistant Markdown sanitized with an allow-list; links to external hosts render as text
- [ ] Entity links (`#txn:`, `#wallet:`, `#cat:`, `#file:`, `#navigate:`) render as buttons that open the sheet, the canvas or a route
- [ ] Tool calls render as human labels with a derived fallback for unlabelled tools
- [ ] One finished call shows a check; several collapse to "Used N tools", expandable; the in-flight one shimmers
- [ ] Assistant text arriving before the last tool call is suppressed while tools are still running
- [ ] Suggestion chips on an empty session
- [ ] Verify in browser

### US-031b: Chat write invalidation
Requirements: CHAT-12

- [ ] A tool-name to invalidation map, deduplicated by tool call ID
- [ ] A transaction write invalidates the list, the detail, the summary, wallet balances and the overview
- [ ] A wallet or category write invalidates the lists and the transaction filter options
- [ ] Creating a transaction in chat, then switching to the transaction page, shows it without a manual reload
- [ ] Verify in browser

### US-032: Chat settings
Requirements: CHAT-10

- [ ] `GET` and `PATCH /v1/ai/settings` read and write custom instructions and response language
- [ ] Custom instructions reach the system prompt on the next turn
- [ ] The settings page exposes both fields
- [ ] Verify in browser

---

## M5. Capture

### US-033: Receipt parsing and consistency fixes
Requirements: AI-1, AI-3, AI-7, SEC-21

- [ ] `POST /receipt/parse` returns merchant, date, total, currency and line items
- [ ] **The call passes no tools at all**; a test asserts the tool list is empty
- [ ] `POST /v1/ai/receipt/parse` uploads to the vault, calls the service and returns the draft plus the file ID
- [ ] Cross-field consistency runs in Rust: items sum to subtotal, subtotal plus tax equals total, unit price times quantity equals item amount, date is real, currency is valid ISO 4217
- [ ] A suggested fix is applied and the field is marked as corrected
- [ ] Nothing is persisted as a transaction
- [ ] An unreadable image returns `RECEIPT_UNREADABLE`, not a 500
- [ ] Three receipt fixtures with known totals and dates, plus one fixture whose stated total is deliberately wrong and must be corrected by arithmetic

This story runs the single primary model. The ladder is US-033b, so the flow is working before it is optimized.

### US-033b: Extraction quality ladder
Requirements: AI-10, AI-11

- [ ] `calculateQualityScore` as a pure function with the weights in [the ladder](ai/service.md#quality-score). Unit tested with no model
- [ ] Pass 1 runs `AI_VISION_PRIMARY` and returns immediately when the score reaches `AI_QUALITY_THRESHOLD`
- [ ] Pass 2 runs the secondary model with a chain-of-thought prompt, or the tertiary when pass 1 scored below half the threshold
- [ ] Results merge per the stated rules, including the close-confidence field rules for total, date, merchant and line items
- [ ] Pass 3 re-extracts only the invalid fields, one targeted prompt per field, capped at 4 calls
- [ ] A failed pass never aborts the ladder; pass 2 failing falls through to pass 3
- [ ] The call cap and the 45 second budget each stop the ladder and return a marked result, not an error
- [ ] `RECEIPT_UNREADABLE` only when `total` and `date` are both absent after pass 4
- [ ] The response carries `quality.score`, `low_confidence_fields` and `corrected_fields`
- [ ] A clean fixture makes exactly one model call; a poor fixture escalates. Both asserted against a scripted client
- [ ] Per-extraction logging: pass reached, model per pass, score per pass, fields re-extracted, duration
- [ ] The same ladder serves `/import/extract`

### US-034: Receipt confirmation and the canvas
Requirements: AI-2, UI-2, CHAT-13

- [ ] A side panel component driven by URL parameters (`?canvas=…&id=…`), surviving reload
- [ ] The panel mounts the real confirmation sheet and the real transaction form, not a separate rendering
- [ ] The conversation column animates its margin so it reflows beside the panel; full width below the medium breakpoint
- [ ] Uploading from chat or from the transaction page opens the panel
- [ ] Every parsed field is editable; corrected fields are visibly marked, and low confidence fields are flagged for the user to check (AI-11)
- [ ] The wallet defaults to the workspace default; a matching category is preselected
- [ ] Confirming creates the transaction with its items and the receipt attached
- [ ] Cancelling leaves the file and creates nothing
- [ ] The assistant writes one sentence and does not repeat the draft contents in text
- [ ] Verify in browser

### US-035: AI statement import
Requirements: AI-4, AI-5, AI-6, TXN-16, TXN-17, SEC-18, SEC-21

- [ ] `POST /v1/transactions/import` creates a job row and returns `202 {job_id}`
- [ ] A PDF carrying a text layer is parsed deterministically first; vision is the fallback (D42)
- [ ] A tokio task calls `/import/extract`, which also passes no tools, then creates rows one by one
- [ ] Each row gets a fingerprint; an existing one counts as a duplicate
- [ ] A failed row counts as skipped and does not abort the job
- [ ] Imported, skipped and duplicate counts written back on completion; capped at 5,000 rows
- [ ] A job `pending` past 10 minutes reports as stale and the modal offers a retry
- [ ] A failed job keeps its uploaded file, so a retry does not re-upload
- [ ] Re-importing the same statement twice creates nothing the second time
- [ ] The modal polls every 2 seconds and shows the review screen
- [ ] Verify in browser

---

## M6. Hardening

### US-036: Limits, headers, secrets
Requirements: PLT-4, AUTH-6, OPS-5, OPS-6, SEC-14 to SEC-19

- [ ] Every rate limit and size limit from [hardening](security/hardening.md#limits), as configuration with those defaults
- [ ] CSP, HSTS, `nosniff`, referrer policy, permissions policy and `frame-ancestors 'none'` on every HTML response
- [ ] CORS allows nothing (SEC-16)
- [ ] The chat turn limit holds: the 21st turn in a minute for one workspace is refused (SEC-17)
- [ ] A test asserts no browser-reachable code path calls the API or the AI service directly (PLT-4)
- [ ] Internal routes reject a request without a valid service key, compared in constant time
- [ ] A header snapshot test, so a loosened CSP shows up in review (SEC-15)
- [ ] A test asserts no secret value appears in captured logs

### US-037: AI safety test corpus
Requirements: SEC-21 to SEC-26

- [ ] Every case in [AI safety testing](security/ai-safety.md#testing) implemented
- [ ] A receipt carrying an injected instruction produces no tool call from the extraction path
- [ ] Document text reaches the tool-capable loop only inside a labelled block, never as an unreviewed tool argument (SEC-22)
- [ ] A `member` write attempt is refused and reported
- [ ] An unchallenged `confirmed: true` is rejected, and a confirmation token cannot move between IDs
- [ ] Each blast-radius cap has a test
- [ ] Model output containing an HTML event handler is sanitized before rendering

### US-038: Test suite and CI
Requirements: OPS-7, SEC-20

- [ ] `cargo test` covers services and repositories against a test database
- [ ] `pytest` covers the tool loop with a mocked model
- [ ] Vitest covers the app's pure modules and the OWE1 client vectors
- [ ] Playwright covers log in, create a transaction, and a chat message that creates a transaction
- [ ] An axe pass on the three main screens
- [ ] GitHub Actions runs lint, typecheck, tests and the three audit tools for all apps on every push
- [ ] The whole run finishes under 5 minutes
- [ ] Deployment targets Coolify on the existing VPS, with files in Cloudflare R2 (D41)

### US-039: Documentation pass
Requirements: all

- [ ] Every doc in [the index](README.md#all-documents) reflects what was built
- [ ] Each feature doc's "Update this doc when" list is accurate
- [ ] `docs/ENV_VARS.md` generated from the running configuration
- [ ] `CLAUDE.md` at the root points at the index and states the layer rules
- [ ] Every requirement ID in the [PRD](prd.md#6-requirements) has a passing test or a browser-verified story, or is listed as not done with a reason

---

## Coverage check

Run this before declaring a milestone finished: every requirement ID in [PRD section 6](prd.md#6-requirements) should appear in at least one story above. A requirement with no story is either out of scope and belongs in the non-goals, or it is a gap.

## Related docs

- [Docs index](README.md) and [PRD](prd.md)
- [Architecture](architecture.md) and [data model](data-model.md)
- [Transactions](features/transactions.md) and [chat](features/chat.md)
- [Hardening](security/hardening.md) and [AI safety](security/ai-safety.md)
