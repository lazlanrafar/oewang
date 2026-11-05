# oewang: Product Requirements Document

Status: draft v0.1, 2026-11-02; Telegram added 2026-11-05 (D83); vault and usage added 2026-11-05 (D90, D92). Owner: Azlan. Part of the [oewang docs](README.md).

oewang is a personal finance tracker: daily income and expenses, wallets, categories, receipts, and an AI assistant that can read and write the same data through chat. This document covers a ground-up rewrite of the existing implementation ([legacy app](reference/legacy-app.md)) onto a new stack, with the scope cut to two features.

## 1. Problem

The current implementation works, but it costs too much to move.

- It is a seven-app Turborepo: a Next.js app, an admin dashboard, a marketing site, an ElysiaJS API, a Python AI service, a Go background worker, and a Flutter mobile app.
- It carries twelve feature areas (transactions, invoices, debts, budgets, contacts, vault, billing, integrations, notifications, metrics, workspaces, settings) across 42 database tables.
- Three processes write to Postgres directly (the API, the AI service, the worker). Business rules such as wallet balance arithmetic, workspace scoping and audit logging are implemented more than once, in two languages, and have drifted.
- Every API response is AES-256-GCM encrypted at the application layer on top of TLS. It adds a decryption step to every client call and buys nothing, because both ends hold the same key.
- The chat assistant exposes 34 tools, most of them for features that are not the point of the product.

The result: a small change touches several apps, and deleting a feature is harder than rebuilding the two that matter.

## 2. Goals and non-goals

### Goals

1. **G1. Two features, finished.** Transactions (full CRUD, line items, attachments, CSV and AI import) and AI chat (tool-calling assistant plus receipt OCR). Nothing else. Telegram (section 6.11) is those same two features reached from a chat, added by D83; it brings no feature of its own. The vault page (section 6.5, D90) browses the files those two features already store, and the usage page (section 6.13, D92) reports what they cost.
2. **G2. One writer.** Exactly one process holds a database connection. Every business rule is enforced in exactly one place.
3. **G3. Same product, new stack.** Screens, layouts and interactions carry over from the old app. The code does not.
4. **G4. Multi-workspace stays.** A user belongs to several workspaces with a role in each, as today.
5. **G5. Ready for a second language without a refactor.** English copy only, but every string resolves through a dictionary.
6. **G6. Documented as it is built.** `docs/` is the shared context for people and for coding agents.

### Non-goals for v1

Each of these exists in the old app and is deliberately left out. Adding any of them needs its own PRD.

- Invoices: creation, sending, the public invoice page, payment tracking.
- Debts and receivables, including the related chat tools.
- Budgets and budget-exceeded notifications.
- Contacts and bill splitting.
- ~~Vault as a browsable feature: `vault_files` exists only to back attachments and receipts.~~ The vault page came back with D90 (VLT-6 to VLT-13). Still out: document RAG and a `search_documents` tool.
- Billing: plans, Mayar payments, AI token quotas, storage limits, the upgrade flow. Usage is recorded and shown (section 6.13, D92), never limited.
- Integrations: third-party connectors and webhooks. Telegram was on this list until D83 moved it into section 6.11; nothing else on the old Apps page came with it (Gmail, Outlook, the MCP clients).
- The admin dashboard and the marketing website.
- The Flutter mobile app and offline sync.
- The Go background worker (D10).
- The MCP server and its OAuth client registration.
- OAuth login. Email and password only (D21).
- Application-layer payload encryption (D9).
- Web search in chat. Canvas artifacts and chat charts were on this list until D88 brought the analysis canvas back for spending, income and burn rate; debt and budget canvases stay out with their features.
- Anomaly detection and transaction classification.
- Notifications: in-app centre, push, email alerts.
- A second UI locale. The i18n layer ships, `en.json` is the only dictionary (D15).
- Realtime multi-client sync. A client refetches after its own mutation.
- Application-layer encryption of the browser-to-web-app hop, for v1 (D26). The two service hops are encrypted (D22); see [which hops are protected](api/encryption.md#which-hops-are-protected) for why the browser hop is different, and [Q8](#10-open-questions).

## 3. Personas

| Persona | Needs |
|---|---|
| **Individual tracker** (primary) | Record an expense in seconds, see where the money went this month, photograph a receipt instead of typing it. |
| **Household or small team owner** | One workspace shared with one or two others, control over who can write, a record of who changed what. |
| **Member** | Read the workspace's numbers, ask the assistant questions, no write access. |
| **The assistant** | Structured tools with clear errors, the workspace's wallets and categories on every turn, a refusal when the caller lacks the role. |

## 4. Product principles

1. **The ledger is the product.** Every feature exists to get a correct number into the ledger with less effort.
2. **Money is never approximate.** Decimal end to end, string on the wire, no floating point anywhere (D12).
3. **Nothing is written without the user seeing it.** A parsed receipt is a draft. A chat delete needs a confirmation turn (D20).
4. **One rule, one place.** If a rule is in Rust, it is not also in Python or in Svelte (D3, D4).
5. **Nothing is really deleted.** Soft delete on every workspace-scoped row, audit log on every mutation (D14).

## 5. Scope decisions

Confirmed by the owner on 2026-11-02, and recorded in the [decision log](architecture.md#decision-log).

| Area | Decision | Decision ID |
|---|---|---|
| Tenancy | Multi-workspace with roles `owner`, `admin`, `member`, as in the old app | D7 |
| Data model | Full schema for the transaction and chat domain; other domains dropped | D8 |
| Chat | Tool-calling assistant that writes to the database, plus receipt OCR | D17 |
| AI split | Python owns all LLM work; Rust owns the database and the business rules | D3, D4 |
| Frontend | SvelteKit SSR acting as a BFF, session in an httpOnly cookie | D5, D6 |
| UI | Port the old visual design; English only, through an i18n dictionary | D15 |

### 5.1 Interpretation of the data model decision

"Full data model" means full for the transaction and chat domain, not the old 42 tables. The sixteen tables in scope are listed in [data model](data-model.md#tables-in-scope). Out of scope: invoices, debts, budgets, contacts, notifications, billing, orders, pricing, plan features, workspace addons, integrations, MCP tables, articles, FAQs, feedback, device tokens, push subscriptions, privacy requests, webhook events, system settings, knowledge chunks.

### 5.2 Assumptions

Work proceeds on these unless corrected.

| ID | Assumption |
|---|---|
| **A1** | The LLM provider is Claude. `claude-sonnet-5-5` runs the chat tool loop; `claude-opus-5` runs receipt OCR and statement extraction, where a parse error is expensive. Both IDs are environment variables. |
| **A2** | The database starts empty. No production data is migrated from the old app (D16). |
| **A3** | Files are stored on the local filesystem in development and in S3-compatible object storage (Cloudflare R2) in production, behind one storage trait. |
| **A4** | ~~TLS is the only transport protection.~~ Superseded on 2026-11-02 by D22: every body on the two service hops is encrypted at the application layer with OWE1, on top of TLS. See [payload encryption](api/encryption.md). |
| **A5** | Asynchronous work (AI statement import) runs as a tokio task inside the API, with job state in `transaction_import_jobs` so the UI can still poll (D10). |

## 6. Requirements

Requirement IDs are referenced by every other doc and by each backlog story. They do not change once assigned.

### 6.1 Platform (PLT)

| ID | Requirement |
|---|---|
| PLT-1 | The system runs as three processes: the web app (3000), the API (3002), the AI service (3004). |
| PLT-2 | The API is the only process that opens a connection to PostgreSQL. |
| PLT-3 | The AI service performs every side effect through the API's internal endpoints. It holds no database credentials. |
| PLT-4 | The browser never calls the API or the AI service directly. All traffic passes through SvelteKit server routes. |
| PLT-5 | Each app builds, runs and is deployed independently. The apps share no code package; they speak HTTP. |

### 6.2 Authentication and tenancy (AUTH, WS)

| ID | Requirement |
|---|---|
| AUTH-1 | A user registers with an email address and a password. The password is hashed with Argon2id. |
| AUTH-2 | A successful login returns a JWT signed with HS256, carrying `user_id`, `workspace_id`, `role` and `exp`. |
| AUTH-3 | The token is stored in an `httpOnly` cookie set by the SvelteKit server. Client-side JavaScript never reads it. |
| AUTH-4 | The API derives `workspace_id` only from JWT claims, and rejects any `workspace_id` supplied in a body or query string. |
| AUTH-5 | An unknown email and a wrong password return the same error and take comparable time. |
| AUTH-6 | Authentication endpoints are rate limited to 10 requests per 15 minutes per IP address. |
| AUTH-7 | A session is a 15 minute access JWT plus a 30 day refresh token, both in `httpOnly` cookies (D38). |
| AUTH-8 | Refresh and password reset tokens are stored as SHA-256 hashes. The raw token is never persisted. |
| AUTH-9 | A refresh rotates the token. Reusing a rotated token revokes every token descended from that login. |
| AUTH-10 | A user can reset a forgotten password through a single-use emailed token that expires in 1 hour. The request endpoint always answers 204, so it cannot enumerate users. A successful reset revokes every session. |
| AUTH-11 | A user may change their display name. The email is shown and cannot be changed (D94). |
| AUTH-12 | A user may change their password by giving the current one. Every other session and Telegram link ends; the browser that changed it stays signed in (D94). |
| AUTH-13 | A user may set and remove a profile photo. It is kept as a 256px square JPEG under the user, not a workspace, and served through the app (D94). |
| WS-1 | A user may belong to several workspaces, with one role per workspace. |
| WS-2 | A user may switch workspace and receives a re-scoped JWT. |
| WS-3 | A workspace owner or admin may invite a user by email and remove a member. |
| WS-4 | The last remaining owner cannot be removed or demoted. |
| WS-5 | Registration creates a user, a workspace and an `owner` membership in one database transaction. |
| WS-6 | A signed-in user may create another workspace, which they own, seeded as registration seeds one, and is switched into it. One person owns at most 10 (D94). |

### 6.3 Wallets and categories (WAL, CAT)

| ID | Requirement |
|---|---|
| WAL-1 | A workspace has wallets, optionally grouped into wallet groups. |
| WAL-2 | A wallet carries a balance as `decimal(19,4)`, a sort order, an "include in totals" flag and a default flag. |
| WAL-3 | Exactly one wallet per workspace is the default. Setting a new default clears the previous one in the same transaction. |
| WAL-4 | A wallet with live transactions cannot be deleted. |
| WAL-5 | A wallet has its own ISO 4217 currency, defaulting to the workspace currency. Its balance is denominated in it (D37). |
| WAL-6 | A wallet's currency is locked once it has a live transaction. The workspace currency is locked once any transaction exists. |
| CAT-1 | A category has a type, `income` or `expense`, and a sort order. |
| CAT-2 | Deleting a category sets `category_id` to null on its transactions instead of blocking. |
| CAT-3 | A new workspace is seeded with a default set of categories and one default wallet. |

### 6.4 Transactions (TXN)

| ID | Requirement |
|---|---|
| TXN-1 | A transaction has one of three types: `income`, `expense`, `transfer`. |
| TXN-2 | `amount` is stored as `decimal(19,4)`, always positive. Direction comes from the type. |
| TXN-3 | Creating a transaction adjusts wallet balances atomically with the insert, per the rules in [data model](data-model.md#balance-arithmetic). |
| TXN-4 | Updating a transaction reverses the previous balance effect and applies the new one, atomically. |
| TXN-5 | Deleting a transaction soft-deletes it and reverses its balance effect. |
| TXN-6 | Wallet rows affected by a balance change are row-locked for the duration of the database transaction. |
| TXN-7 | A `transfer` carries a `to_wallet_id` that differs from `wallet_id`. Other types leave it null. |
| TXN-8 | The transaction list supports filtering by wallet, category, type, date range, free-text search and ready flag. |
| TXN-9 | Filter state lives in URL search parameters and survives a reload. |
| TXN-10 | Transactions can be exported as CSV, honouring the active filters. Exported rows are marked. |
| TXN-11 | Transactions can be imported from CSV or XLSX through a field-mapping wizard, committed through a bulk endpoint. |
| TXN-12 | A transaction can carry line items (name, brand, quantity, unit, unit price, amount, category). |
| TXN-13 | A transaction can carry file attachments. |
| TXN-14 | Several transactions can be updated or deleted in one bulk action. |
| TXN-15 | Write operations require role `owner` or `admin`. |
| TXN-16 | Every imported transaction carries a deterministic content fingerprint, unique per workspace. A row whose fingerprint already exists is counted as a duplicate and skipped (D29). |
| TXN-17 | An import job stuck in `pending` for more than 10 minutes is reported as stale and offers a retry. A failed job keeps its uploaded file. |
| TXN-18 | A transfer carries `to_amount` in the destination wallet's currency. A cross-currency transfer moves two different figures (D37). |
| TXN-19 | Every transaction stores `base_amount`, its value in the workspace currency, computed at write time. Reports sum that column and never convert at read time. |
| TXN-20 | A transaction may be entered in a currency other than its wallet's. It is converted once at entry; the entered amount, its currency and the rate used are stored on the row. The rate prefills from a daily source and the user may override it (D39). |
| TXN-21 | The transaction list shows the wallet-currency amount and, when the entry currency differed, the original amount beside it. Totals always render in the workspace currency. |
| TXN-22 | At write time the rate resolves in a fixed order and a write never fails while any cached rate exists. How the rate was obtained and which day it belongs to are stored on the row, and a stale rate is marked in the UI (D43). |
| TXN-23 | An import converts each row with the rate for that row's own date. A row with no rate available is skipped and reported (D45). |

### 6.5 Files (VLT)

| ID | Requirement |
|---|---|
| VLT-1 | The API accepts upload of JPEG, PNG, WebP and PDF files up to 10 MB, in 512 KiB chunks sent as base64 JSON inside OWE1 ([file bytes](api/encryption.md#file-bytes)). Originally written as multipart; chunked since D23. |
| VLT-2 | Files are stored behind a storage trait: local filesystem in development, S3-compatible storage in production. |
| VLT-3 | Download happens through the API in encrypted chunks. No signed object-storage URL is ever issued (D23). |
| VLT-4 | Files are workspace-scoped. A cross-workspace request returns 404, not 403. |
| VLT-5 | Removing an attachment soft-deletes the join row, not the file. |
| VLT-6 | `/vault` lists the workspace's ready files as a grid or a list, newest first, with search by name. The search, the view and the open file live in the URL (UI-8). The grid loads 15 at a time with infinite scroll. Dropping files anywhere on the page uploads them (D90). |
| VLT-7 | A file opens in its own sheet: a preview (the image, or the PDF in a frame), its name, date created, format and size, its tags, the transactions that carry it, and open, download and delete. The same sheet opens from an attachment on a transaction. |
| VLT-8 | A writer can rename a file. The name is cleaned the way an upload filename is. |
| VLT-9 | A writer can tag a file: at most 10 tags of at most 32 characters, trimmed, duplicates dropped case-insensitively keeping the first spelling. A tag over the limit is refused, never cut. |
| VLT-10 | The file sheet lists the newest 20 live transactions that carry the file, each linking to its detail sheet, with the exact count beside them. |
| VLT-11 | Deleting a file asks first, says how many transactions it is attached to, and detaches it from all of them in the same database transaction as the soft delete. |
| VLT-12 | An image file gets a small square preview, made by the API once on first request and stored beside the file. A PDF or an undecodable image gets an icon and is never retried (D91). |
| VLT-13 | On a transaction, attachments are square tiles. The form sheet and the detail sheet each offer the vault picker, which searches, sorts and filters across every page on the server and can upload new files. A change in the detail sheet saves at once. |

### 6.6 Chat (CHAT)

| ID | Requirement |
|---|---|
| CHAT-1 | Each conversation persists as a session row with its messages. |
| CHAT-2 | Responses stream to the browser over server-sent events. |
| CHAT-3 | The assistant has access to the fourteen tools listed in [AI service](ai/service.md#tool-catalog) and no others (D17, D88). |
| CHAT-4 | Tool calls are executed by the API, which enforces the caller's role and writes an audit log row. |
| CHAT-5 | The tool loop stops after at most 8 rounds per user turn. |
| CHAT-6 | `delete_transaction` requires explicit user confirmation in a separate turn. |
| CHAT-7 | The system prompt includes the workspace's current wallets and categories on every turn. |
| CHAT-8 | A session title is generated from the first user message. |
| CHAT-9 | Aborting a stream stops generation and persists the partial reply. |
| CHAT-10 | Workspace-level custom instructions and a response language setting are appended to the system prompt. |
| CHAT-11 | Entity names in assistant output are clickable links in a fixed scheme, intercepted by the renderer. External links render as plain text (D33). |
| CHAT-12 | A tool write invalidates the affected view and every view derived from it (D32). |
| CHAT-13 | The chat canvas mounts the real application component in a side panel, driven by URL parameters. No model-authored UI (D31). The analysis canvases of CHAT-16 are built by the API, not the model, and keep the same URL rules. |
| CHAT-14 | Tool calls render as human labels with collapsed grouping. Assistant text arriving before the last tool call is suppressed while tools are still running. |
| CHAT-15 | The model performs no arithmetic. Every number it states is computed, rounded and formatted by the API (D27). |
| CHAT-16 | Three analysis tools, `get_spending_analysis`, `get_income_summary` and `get_burn_rate`, each leave a canvas artifact of the same report the model read. The API builds the payload from the database and injects it into the stream after the tool's result; the AI service never carries one, and one arriving from upstream is dropped (D88). |
| CHAT-17 | An artifact opens the canvas as it arrives. A conversation's artifacts are listed as tabs, each message that made one carries a toggle for it, and the open one lives in `?canvas=<kind>&id=<tool call id>` (UI-8). An empty range leaves no artifact. |
| CHAT-18 | Artifacts are stored on the assistant message with the tool call that made them, so a reload reopens the same canvas with the figures as they were when it was answered. |
| CHAT-19 | The chat screen is the old app's layout: a header with the way back to the overview, the title and a new-chat button; the conversation in one centred column; a floating composer at the bottom with the conversation list behind its history button (D87). |

### 6.7 AI parsing (AI)

| ID | Requirement |
|---|---|
| AI-1 | Uploading a receipt image produces an editable draft: merchant, date, total, currency, line items. |
| AI-2 | A receipt draft is never committed as a transaction without user confirmation. Exception: a receipt sent to the Telegram bot is saved on arrival, because sending it is the request and the reply carries the undo (TG-5, D86). |
| AI-3 | An unreadable receipt returns a 422 with a specific error code, not a 500. |
| AI-4 | A bank statement image or PDF can be imported asynchronously, returning a job ID immediately. |
| AI-5 | A failed import row counts as skipped and does not abort the job. |
| AI-6 | Import job status, imported count, skipped count and duplicate count are readable by polling. |
| AI-7 | Extraction output passes through cross-field consistency checks and arithmetic fixes, in code, before the user sees it. Corrected fields are marked (D30). |
| AI-8 | Tool results are a compact projection of the row, truncated to a byte budget that sets an explicit `truncated` flag (D34). |
| AI-9 | A file with columns is imported by mapping its **columns** with one model call. Rows are transformed by deterministic code. The model never sees an amount (D28). |
| AI-10 | Extraction escalates on evidence: a cheap model first, a computed quality score, a stronger model only when the score is below the threshold, then targeted re-extraction of only the invalid fields. Bounded by a call cap and a wall-clock budget (D36). |
| AI-11 | A draft carries its quality score, the fields the ladder is unsure about, and the fields arithmetic corrected. The confirmation sheet marks both. A Telegram reply names both as "Please check" (TG-6). |

### 6.8 User interface (UI)

| ID | Requirement |
|---|---|
| UI-1 | Every user-facing string resolves through the `en.json` dictionary. No literals in markup. |
| UI-2 | Transaction, account and chat screens reproduce the layout and interaction model of the old app, per the port maps in [transactions](features/transactions.md#ui-port-map), [accounts](features/accounts.md#ui-port-map) and [chat](features/chat.md#ui-port-map). |
| UI-3 | Light and dark mode are supported and the choice persists. |
| UI-4 | Destructive actions require confirmation. |
| UI-5 | Every monetary value renders with the currency it is denominated in and correct decimal precision. A wallet balance uses its wallet's currency; a total uses the workspace currency. |
| UI-6 | Every screen is usable at 375 px width. |
| UI-7 | Interactive elements are reachable by keyboard, and every path a pointer can take a keyboard can take too. **Two known failures, accepted so the interface matches the old app exactly (D66):** there is no visible focus indicator anywhere, which fails WCAG 2.4.7, and the income and expense colours render at 2.30:1 and 3.91:1 where body text needs 4.5:1, which fails 1.4.3. Colour is never the only carrier of meaning: an amount shows a sign, a category shows its name. Motion is opt-in under `prefers-reduced-motion` (D64). Both failures are the first thing to revisit if accessibility becomes a requirement. |
| UI-8 | View state lives in the URL. Every filter, search term, sort, page number, date range, grouping and open tab is a query parameter, so a refresh restores the view, the back button undoes a change, and a pasted link reproduces what the sender saw. Nothing that changes what is on screen is held only in a component. Per-browser conveniences (column visibility, density, sidebar collapsed) stay in `localStorage`; secrets never go in a URL. |

### 6.9 Security (SEC)

Specified in [payload encryption](api/encryption.md), [hardening](security/hardening.md) and [AI safety](security/ai-safety.md).

#### Payload encryption

| ID | Requirement |
|---|---|
| SEC-1 | Every request body and response body between the web app and the API, and between the API and the AI service, is encrypted at the application layer on top of TLS (D22). |
| SEC-2 | Keys come from a per-session X25519 handshake with HKDF-SHA-256, producing one AES-256-GCM key per direction. |
| SEC-3 | The handshake is signed with a long-term Ed25519 key that every client pins. A client that cannot verify it stops, and never falls back to plaintext. |
| SEC-4 | Each message is bound through AEAD associated data to its session, method, path, request ID, timestamp and HTTP status. |
| SEC-5 | Query strings travel encrypted in a header. A plaintext query on a protected route is rejected. |
| SEC-6 | A replayed request is rejected: timestamp within 120 seconds, request ID unseen for 5 minutes. |
| SEC-7 | Chat stream events are sealed individually, with a per-stream sequence number in the associated data. |
| SEC-8 | File bytes are transferred through the API in encrypted chunks. No signed object-storage URLs (D23). |

#### Hardening

| ID | Requirement |
|---|---|
| SEC-9 | Every database query uses bound parameters. No string concatenation into SQL. |
| SEC-10 | Dynamic sort and order values map to fixed fragments, never interpolated. |
| SEC-11 | Assistant Markdown is sanitized with an allow-list before rendering. `{@html …}` is used nowhere else. |
| SEC-12 | An uploaded file's actual type is sniffed from its bytes and must match the declared type. SVG and HTML are never accepted. |
| SEC-13 | A storage key is generated by the API. A client-supplied filename never becomes a path. |
| SEC-14 | No endpoint fetches a user-supplied URL. |
| SEC-15 | The web app sets a Content Security Policy with no `'unsafe-inline'` in `script-src`, plus HSTS, `nosniff`, a referrer policy and `frame-ancestors 'none'`. |
| SEC-16 | The API accepts no cross-origin browser request. |
| SEC-17 | Chat is limited to 20 turns per workspace per minute. |
| SEC-18 | Size caps: 1 MB request body, 10 MB file, 500 rows per bulk operation, 5,000 rows per import job, 100 per page. |
| SEC-19 | Timeouts: 30 second request, 120 second chat stream, 10 second database statement, 5 second pool acquire. |
| SEC-20 | `cargo audit`, `bun audit` and `pip-audit` run in CI and fail the build on a known vulnerability. |

#### AI safety

| ID | Requirement |
|---|---|
| SEC-21 | Receipt and statement extraction runs with no tools available to the model (D24). |
| SEC-22 | Untrusted document text enters a prompt inside a labelled block, and is never passed as an unreviewed tool argument. |
| SEC-23 | Per turn, the API caps write tool calls at 3, deletes at 1, and transactions created at 3 (D25). |
| SEC-24 | A tool-created transaction has a configurable maximum amount. |
| SEC-25 | A delete confirmation is scoped to one transaction ID, expires after 5 minutes, and is not honoured on an unchallenged first call. |
| SEC-26 | No bulk write tool, no browsing tool, no URL-fetching tool, and no membership or settings tool exists. |

### 6.10 Operations (OPS)

| ID | Requirement |
|---|---|
| OPS-1 | Every mutation writes an audit log row inside the same database transaction as the mutation. |
| OPS-2 | Workspace-scoped records are never hard-deleted. |
| OPS-3 | Logs never contain passwords, JWTs, API keys or file contents. |
| OPS-4 | Errors use the envelope in [API conventions](api/conventions.md#the-envelope) with a stable code. |
| OPS-5 | Rate limits: 300 requests per minute authenticated, 30 per minute unauthenticated, 10 per 15 minutes on auth endpoints. |
| OPS-6 | Internal endpoints reject any request without a valid service API key. |
| OPS-7 | CI runs lint, typecheck and tests for all three apps on every push. |
| OPS-8 | A transaction's detail sheet shows its audit history: who changed what, when, and from which surface (D46). |

### 6.11 Telegram (TG)

Added by D83. See [Telegram](features/telegram.md).

| ID | Requirement |
|---|---|
| TG-1 | A member connects a private Telegram chat from the Apps page with a one-time link: random, stored hashed, valid for ten minutes, usable once, and bound to the member and workspace that minted it. Nothing a Telegram message carries names a workspace or a user. |
| TG-2 | Only private chats, and only the Telegram account that opened the link, can act through a connection. Group chats are refused. |
| TG-3 | A member holds one connection per workspace and a chat one connection at a time. Disconnecting from the Apps page, `/disconnect` in the chat, signing out everywhere, resetting the password and leaving the workspace each end it. |
| TG-4 | Every update re-reads the membership row. A member who can no longer write cannot write from Telegram; one who left the workspace is disconnected. |
| TG-5 | A receipt photo or PDF sent to the bot is saved as an expense with its items and the file attached, in the default account holding the receipt's currency, through the same vault, extraction and transaction services as the web flow. A receipt without a readable total is not saved. |
| TG-6 | The reply states what was saved, every figure formatted by the API: name, amount, category, date, items, this month's expense total and the category's total, and any field to check. Its buttons recategorise the transaction or delete it after a second tap. |
| TG-7 | A category is suggested by a tool-less model call over the merchant, the item names and the workspace's expense category names, and kept only when it names one of them exactly. Otherwise the transaction is uncategorised. |
| TG-8 | A text message is a turn of the assistant in the chat's own conversation, under every control a web turn has: the turn budget, the role gate, the delete confirmation and the per-workspace rate limit. The reply is plain text. |
| TG-9 | The API receives updates by long polling from its single instance. Each update is handled at most once. No route is exposed to Telegram. |
| TG-10 | Nothing Telegram sends is logged: no message text, caption, file or reply. The bot token is never logged. |

### 6.12 Overview (OVR)

Added by D87. See [Overview](features/overview.md).

| ID | Requirement |
|---|---|
| OVR-1 | `/overview` is the workspace's front page; `/` redirects to it. It greets the reader by first name and shows one date range, a year of whole months by default, held in `?from&to` (UI-8). |
| OVR-2 | The overview tab shows income, expenses and net for the range with the change against the period of equal length before it, the top expense category, the average monthly burn, and the tracked balance of the wallets included in totals, marked partial when a rate is missing. Every figure is computed by the API (D27). |
| OVR-3 | The metrics tab charts income and expenses per month with their averages, the income and expense breakdowns by category, and the monthly burn rate. The tab lives in `?tab=`. |
| OVR-4 | A floating composer, the prompt chips and a click on a card each start a conversation: the session is created, the conversation opens, and the question is sent there. Nothing is sent twice on reload. |
| OVR-5 | The overview declares the summary, overview and wallet balance invalidation keys, so a chat write moves its figures without a reload (D32). |

### 6.13 Usage (USG)

Added by D92. See [Usage](features/usage.md).

| ID | Requirement |
|---|---|
| USG-1 | A workspace's storage used is derived from its rows: the sum of `size` and the count over ready, non-deleted files. No counter is stored. |
| USG-2 | Every model call's input and output tokens are recorded per workspace and per feature, with the model and the member it was made for, in an append-only table. A failed record never fails the call. |
| USG-3 | A settings page, readable by any member, shows storage used and tokens for this calendar month and all time, in total and by feature. Nothing is limited. |

## 7. Success metrics

| Metric | Target |
|---|---|
| Time to first recorded transaction, from a cold start, without documentation | Under 2 minutes |
| Transaction list, page 1, against a 10,000 row workspace | Under 100 ms server-side |
| Chat first token | Under 2 seconds |
| "Add a 50,000 lunch expense from my BCA wallet" | Correct transaction and balance on the first turn |
| Receipt parsing: total and date correct | At least 8 of 10 test receipts |
| Total line count across the three apps, against the old app and API combined | Under 40 percent |
| CI run time | Under 5 minutes |
| Requirements with a passing test or a browser-verified story | 100 percent |

## 8. Milestones

Detailed stories are in [backlog.md](backlog.md).

| Milestone | Stories | Outcome |
|---|---|---|
| **M0. Foundation** | US-001 to US-006 | Three apps build, schema migrates, OWE1 works across all three languages, the app shell renders. |
| **M1. Accounts** | US-007 to US-010, including US-008b and US-010b | Register, log in with rotating sessions, reset a forgotten password, manage a workspace and its members. |
| **M2. Ledger** | US-011 to US-022, including US-013b and US-018b | A usable multicurrency transaction tracker with no AI in it. First demo. |
| **M3. Files** | US-023 to US-025 | Chunked encrypted uploads, attachments, line items. |
| **M4. Assistant** | US-026 to US-032, including US-031b | Streaming chat that reads and writes the ledger. Second demo. |
| **M5. Capture** | US-033 to US-035, including US-033b | Receipt OCR and statement import. |
| **M6. Hardening** | US-036 to US-039 | Limits, headers, the injection corpus, test suite, CI, docs. |
| **M7. Telegram** | US-040 to US-042 | The Apps page, a linked Telegram chat, receipts saved from a photo, and the assistant in the chat. |
| **M8. Overview and the analysis canvas** | US-043 to US-046 | The overview front page, the analysis canvases in chat, and the chat restyle. |
| **M9. Vault and usage** | US-047 to US-050 | The vault page and its file sheet, thumbnails, tiles and the picker on transactions, and a usage page for tokens and storage. |
| **M10. Workspaces and account** | US-051 to US-052 | The workspace switcher, a workspaces page and an account area outside the app shell: profile and photo, password and sessions. |

M2 is the first milestone worth demoing, and it de-risks the stack choice before any LLM work starts.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Server-sent events buffer or stall across two proxy hops (SvelteKit, then Rust, then Python) | Disable response buffering at every hop; an integration test asserts first-token latency under 2 seconds. |
| Decimal handling diverges across Rust, Python and JavaScript | Strings on the wire; `rust_decimal` in Rust, `Decimal` in Python, never a JavaScript `number` (D12). |
| The UI port drifts from the old design | Every UI story names its reference file, and browser verification is in the acceptance criteria. |
| The tool loop performs a wrong write | Schema validation and role gates in Rust, a confirmation turn before deletes, an audit log row on every write. |
| The AI service becomes a second home for business rules | It is never given a `DATABASE_URL` (D3). |
| Scope creeps back toward the old app | Section 2 is the contract. Anything listed there needs a new PRD. |
| Payload encryption is implemented three times, in three languages, and the implementations drift | Shared test vectors that all three sides run, plus an integration test driving the Node and Python clients against a live Rust API ([implementation map](api/encryption.md#implementation-map)). |
| Encryption slows the chat stream past the 2 second first-token target | The latency test runs with encryption on, not off. Per-event sealing is measured, not assumed ([efficiency](api/encryption.md#efficiency)). |
| A prompt injection in a receipt causes a write the user did not ask for | Extraction runs with no tools (D24), blast-radius caps hold in the API (D25), and an injection corpus runs in CI ([AI safety](security/ai-safety.md#testing)). |
| Serving file bytes through the API becomes a bandwidth problem | Accepted at this scale and stated in D23. Revisit with a decision record, not a quiet change. |
| Svelte 5 and SvelteKit idioms are new to the team | [Svelte best practices](best-practices/svelte-app.md) is written before M2, and reviewed at M2. |

## 10. Open questions

Three, all of them the owner's to answer. Each is a trade-off rather than a
gap in the build, and each is recorded where the work stopped rather than
quietly dropped.

| # | Question | What is known |
|---|---|---|
| Q12 | The first token of a chat turn arrives in about 2.4 seconds, against a 2 second target. Accept it, or change the model? | Measured with encryption on, which is not the cost: the gateway's `free-main` injects roughly 3.6k tokens of its own system prompt ahead of ours and routes to a varying upstream. A faster or dedicated model behind `AI_BASE_URL` is a configuration change (D67), not code. With the tool loop in place a first turn that calls a tool takes far longer again, which is expected and is not what the target measures. |
| Q13 | XLSX in the import wizard. | Not built, deliberately and twice over. The only npm build of SheetJS carries a known prototype-pollution advisory, and it would run in the browser, in the same context as the session. CSV, semicolon and tab files are parsed today. Taking the dependency is a decision, not a default. |
| Q14 | CI does not finish in five minutes on a cold cache. | Estimated 4 to 6 minutes warm, 10 to 14 cold, dominated by the Rust job, which compiles the workspace three times over (the sqlx cache check, clippy, the tests). A larger runner for that job alone is the one lever that costs no coverage. Dropping `--all-targets` from clippy would be cheapest and was rejected: it stops linting the test code. |

Resolved, all on 2026-11-02:

| # | Question | Answer |
|---|---|---|
| Q1 | Multicurrency: expose it, or leave the columns dormant? | Expose it. A wallet carries its own currency, defaulting to the workspace currency, and its balance is denominated in it. A transaction may also be entered in a third currency, converted at entry, with the original kept so the list can show both. `base_amount` is stored per row so reports stay a plain sum (D37, TXN-18 to TXN-21). Rates prefill from an API and stay editable (D39). |
| Q2 | Keep the old 7 day static session? | No. 15 minute access token plus a 30 day refresh token, rotated on every use, with family revocation on reuse (D38). |
| Q3 | Is password reset needed for the first release? | Yes, in M1. Single-use emailed token, 1 hour expiry, through Resend (D40, AUTH-10). |
| Q5 | Statement import: images and PDFs, or images only? | Both. A PDF with a text layer is parsed deterministically first; vision is the fallback (D42). |
| Q6 | Deployment target? | Coolify on the existing Hostinger VPS, files in Cloudflare R2 (D41). |
| Q7 | Is there real data in the old app to migrate? | No. The database starts empty, D16 stands. No migration story. |
| Q4 | Audit rows are written but nothing reads them. Ship a UI? | Yes, as a per-transaction history in the detail sheet, not a workspace-wide activity page (D46, OPS-8). |
| Q9 | Can a write fail because the exchange rate source is down? | No. The rate resolves same, then request, then live, then cache, then `FX_RATE_UNAVAILABLE` only when no cached rate has ever existed. A stale rate is stored with its provenance and marked in the UI (D43, TXN-22). |
| Q10 | Which exchange rate source? | exchangerate.host, free and keyless, pulled daily into the cache (D44). |
| Q11 | What happens when an imported row's currency differs from the wallet's? | Each row converts with the rate for its own date. A row with no rate is skipped and reported (D45, TXN-23). |
| Q8 | Should the browser-to-web-app hop also be encrypted, accepting that data fetching must move out of SSR loads into client-side calls? | No. TLS alone on that hop, SSR stays (D26, answered 2026-11-02). The two service hops are encrypted. The accepted gap is stated in [which hops are protected](api/encryption.md#which-hops-are-protected). |

## Related docs

- [Docs index](README.md)
- [Architecture](architecture.md) and the [decision log](architecture.md#decision-log)
- [Data model](data-model.md)
- [Backlog](backlog.md)
- [Legacy app](reference/legacy-app.md)
