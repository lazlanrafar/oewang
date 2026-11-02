# oewang: Product Requirements Document

Status: draft v0.1, 2026-11-02. Owner: Azlan. Part of the [oewang docs](README.md).

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

1. **G1. Two features, finished.** Transactions (full CRUD, line items, attachments, CSV and AI import) and AI chat (tool-calling assistant plus receipt OCR). Nothing else.
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
- Vault as a browsable feature: `vault_files` exists only to back attachments and receipts. No document manager, no document RAG, no `search_documents` tool.
- Billing: plans, Mayar payments, AI token quotas, storage limits, the upgrade flow.
- Integrations: Telegram, third-party connectors, webhooks.
- The admin dashboard and the marketing website.
- The Flutter mobile app and offline sync.
- The Go background worker (D10).
- The MCP server and its OAuth client registration.
- OAuth login. Email and password only (D21).
- Application-layer payload encryption (D9).
- Canvas artifacts, chat charts, web search in chat.
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
| WS-1 | A user may belong to several workspaces, with one role per workspace. |
| WS-2 | A user may switch workspace and receives a re-scoped JWT. |
| WS-3 | A workspace owner or admin may invite a user by email and remove a member. |
| WS-4 | The last remaining owner cannot be removed or demoted. |
| WS-5 | Registration creates a user, a workspace and an `owner` membership in one database transaction. |

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
| VLT-1 | The API accepts multipart upload of JPEG, PNG, WebP and PDF files up to 10 MB. |
| VLT-2 | Files are stored behind a storage trait: local filesystem in development, S3-compatible storage in production. |
| VLT-3 | Download happens through the API in encrypted chunks. No signed object-storage URL is ever issued (D23). |
| VLT-4 | Files are workspace-scoped. A cross-workspace request returns 404, not 403. |
| VLT-5 | Removing an attachment soft-deletes the join row, not the file. |

### 6.6 Chat (CHAT)

| ID | Requirement |
|---|---|
| CHAT-1 | Each conversation persists as a session row with its messages. |
| CHAT-2 | Responses stream to the browser over server-sent events. |
| CHAT-3 | The assistant has access to the eleven tools listed in [AI service](ai/service.md#tool-catalog) and no others. |
| CHAT-4 | Tool calls are executed by the API, which enforces the caller's role and writes an audit log row. |
| CHAT-5 | The tool loop stops after at most 8 rounds per user turn. |
| CHAT-6 | `delete_transaction` requires explicit user confirmation in a separate turn. |
| CHAT-7 | The system prompt includes the workspace's current wallets and categories on every turn. |
| CHAT-8 | A session title is generated from the first user message. |
| CHAT-9 | Aborting a stream stops generation and persists the partial reply. |
| CHAT-10 | Workspace-level custom instructions and a response language setting are appended to the system prompt. |
| CHAT-11 | Entity names in assistant output are clickable links in a fixed scheme, intercepted by the renderer. External links render as plain text (D33). |
| CHAT-12 | A tool write invalidates the affected view and every view derived from it (D32). |
| CHAT-13 | The chat canvas mounts the real application component in a side panel, driven by URL parameters. No model-authored UI (D31). |
| CHAT-14 | Tool calls render as human labels with collapsed grouping. Assistant text arriving before the last tool call is suppressed while tools are still running. |
| CHAT-15 | The model performs no arithmetic. Every number it states is computed, rounded and formatted by the API (D27). |

### 6.7 AI parsing (AI)

| ID | Requirement |
|---|---|
| AI-1 | Uploading a receipt image produces an editable draft: merchant, date, total, currency, line items. |
| AI-2 | A receipt draft is never committed as a transaction without user confirmation. |
| AI-3 | An unreadable receipt returns a 422 with a specific error code, not a 500. |
| AI-4 | A bank statement image or PDF can be imported asynchronously, returning a job ID immediately. |
| AI-5 | A failed import row counts as skipped and does not abort the job. |
| AI-6 | Import job status, imported count, skipped count and duplicate count are readable by polling. |
| AI-7 | Extraction output passes through cross-field consistency checks and arithmetic fixes, in code, before the user sees it. Corrected fields are marked (D30). |
| AI-8 | Tool results are a compact projection of the row, truncated to a byte budget that sets an explicit `truncated` flag (D34). |
| AI-9 | A file with columns is imported by mapping its **columns** with one model call. Rows are transformed by deterministic code. The model never sees an amount (D28). |
| AI-10 | Extraction escalates on evidence: a cheap model first, a computed quality score, a stronger model only when the score is below the threshold, then targeted re-extraction of only the invalid fields. Bounded by a call cap and a wall-clock budget (D36). |
| AI-11 | A draft carries its quality score, the fields the ladder is unsure about, and the fields arithmetic corrected. The confirmation sheet marks both. |

### 6.8 User interface (UI)

| ID | Requirement |
|---|---|
| UI-1 | Every user-facing string resolves through the `en.json` dictionary. No literals in markup. |
| UI-2 | Transaction and chat screens reproduce the layout and interaction model of the old app, per the port maps in [transactions](features/transactions.md#ui-port-map) and [chat](features/chat.md#ui-port-map). |
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
| **M2. Ledger** | US-011 to US-022, including US-018b | A usable multicurrency transaction tracker with no AI in it. First demo. |
| **M3. Files** | US-023 to US-025 | Chunked encrypted uploads, attachments, line items. |
| **M4. Assistant** | US-026 to US-032, including US-031b | Streaming chat that reads and writes the ledger. Second demo. |
| **M5. Capture** | US-033 to US-035, including US-033b | Receipt OCR and statement import. |
| **M6. Hardening** | US-036 to US-039 | Limits, headers, the injection corpus, test suite, CI, docs. |

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

None outstanding.

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
