# Feature: AI Assistant

> See also: [CLAUDE.md](../CLAUDE.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [FEAT_TRANSACTIONS.md](./FEAT_TRANSACTIONS.md) · [FEAT_VAULT.md](./FEAT_VAULT.md) · [FEAT_BILLING.md](./FEAT_BILLING.md) · [REFERENCE_MIDDAY_AI.md](./REFERENCE_MIDDAY_AI.md)

---

## 🤖 AI Agent: Update This Doc When

- Modifying `packages/database/schema/ai-sessions.ts`, `ai-messages.ts`, `ai-agent-settings.ts`, `vault-file-chunks.ts`, or `ai-knowledge-chunks.ts`
- Adding or removing tools in `apps/ai/app/modules/chatbot/tools.py` (`WEB_TOOLS`) or their dispatch in `apps/ai/app/modules/execution/executor.py`
- Changing either system prompt — `apps/ai/app/modules/chatbot/prompts.py` (legacy no-tool-loop path) or `prompts_web.py` (tool-loop path)
- Changing the money path in `apps/ai/app/modules/chatbot/chat_money_path.py` or the receipt-draft short-circuit in `draft.py`
- Changing token quota limits in `packages/database/scripts/seeders/01-plans.ts` / `02-addons.ts` or the enforcement logic in `apps/ai/app/core/quota.py`
- Changing the RAG pipelines: `apps/ai/app/modules/vault/chunking.py` (per-workspace vault docs) or `apps/ai/app/modules/advisor/retriever.py` (global knowledge base)
- Changing how `apps/worker` calls `apps/ai` (`apps/worker/internal/aiclient/*.go`) or how `apps/api`'s `ai-sidecar-client.ts` calls it
- Adding endpoints under `apps/ai/app/api/routes/*.py` or changing the JWT vs `x-api-key` auth split in `apps/ai/app/api/middleware/auth.py` / `app/core/auth.py`

---

## Purpose

The AI Assistant is an in-app chat interface backed entirely by **`apps/ai`**, a standalone Python/FastAPI service (port `3004`, see `apps/ai/app/config.py`). All AI logic — chat orchestration, tool execution (DB writes, audit, quota), receipt OCR, CSV/XLSX import extraction, RAG document search, transaction classification, and anomaly detection — runs there. `packages/ai` (the old TypeScript orchestrator) was deleted entirely; there is no in-process TS fallback for AI features.

The assistant understands the workspace's live financial data through a **40-tool** function-calling loop (see `WEB_TOOLS` below): it can create/edit/delete transactions, manage wallets/wallet groups/budgets/debts/contacts, run spending/revenue/burn-rate/debt/budget analysis (rendered as canvas artifacts), search uploaded vault documents, export transaction reports, and re-send receipts — all gated by the same audit-log and soft-delete discipline as the rest of the app. Each conversation is a persistent Session stored in Postgres.

**Single LLM provider.** `apps/ai/app/core/llm.py` talks to exactly one backend through the OpenAI Python SDK's wire format (`openai.OpenAI(base_url=MODEL_BASE_URL, api_key=MODEL_API_KEY)`) — there is no per-request provider branching (no GPT vs Claude selection like the old TS orchestrator). `MODEL_BASE_URL`/`MODEL_API_KEY`/`AI_CHAT_MODEL` are all env-configured; in this repo's defaults they point at a local OpenAI-compatible model router (`http://localhost:20128/v1`, model `coder`), so "OpenAI-only" describes the integration shape (one OpenAI-wire client, no multi-provider fallback), not necessarily a literal call to `api.openai.com` in every environment.

---

## Data Model

### `ai_sessions` table

| Column         | Type                   | Notes                             |
| -------------- | ---------------------- | ---------------------------------- |
| `id`           | `text` (CUID2)         | Primary key                       |
| `workspace_id` | `text` FK → workspaces | Required                          |
| `title`        | `text`                 | Auto-generated from first message |
| `created_at`   | `timestamp`            | Auto                              |
| `updated_at`   | `timestamp`            | Auto                              |
| `deleted_at`   | `timestamp`            | Soft delete                       |

### `ai_messages` table

| Column         | Type                              | Notes                                                                       |
| -------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| `id`           | `text` (CUID2)                    | Primary key                                                                  |
| `session_id`   | `text` FK → ai_sessions (cascade) | Required                                                                     |
| `workspace_id` | `text`                            | Denormalized for fast workspace queries                                     |
| `role`         | enum                              | `user` \| `assistant` \| `system`                                           |
| `content`      | `text`                            | Message text content                                                        |
| `attachments`  | `jsonb`                           | `invoiceDraft`, canvas `artifacts[]`, `provider` metadata, or file payloads |
| `created_at`   | `timestamp`                       | Auto                                                                         |
| `deleted_at`   | `timestamp`                       | Soft delete                                                                  |

### `ai_agent_settings` table

One row per workspace, created lazily by `apps/ai/app/core/agent_settings.py`'s `get_or_create()` (no cache on the Python side — see Business Logic).

| Column                | Type                   | Default       | Notes                                                                                                             |
| --------------------- | ---------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------ |
| `id`                  | `text` (CUID2)         | —             | Primary key                                                                                                        |
| `workspace_id`        | `text` FK → workspaces | —             | Unique — one config per workspace                                                                                  |
| `model`               | `text`                 | `gpt-4o-mini` | **Stored/editable but not read by apps/ai's chat loop** — see Known Constraints                                    |
| `temperature`         | `decimal(3,2)`         | `0.70`        | **Stored/editable but not read by apps/ai's chat loop** — the loop hardcodes `temperature=0.7`                     |
| `max_steps`           | `integer`              | `10`          | **Stored/editable but not read by apps/ai's chat loop** — the loop uses the `AI_MAX_STEPS` env var instead        |
| `custom_instructions` | `text`                 | `null`        | Actually used — appended to the tool-loop system prompt                                                            |
| `response_language`   | `text`                 | `auto`        | Actually used — `auto` \| `english` \| `indonesian`, drives the language rule in the tool-loop system prompt       |
| `created_at`          | `timestamp`            | Auto          | —                                                                                                                   |
| `updated_at`          | `timestamp`            | Auto          | —                                                                                                                   |

### `vault_file_chunks` table — per-workspace document RAG

Text chunks + embeddings for the workspace's own uploaded documents. Populated by `apps/api`'s `VaultIndexingService.indexBuffer()` after every vault upload (it calls apps/ai's `POST /vault/chunk` for extraction/chunking/embedding, then writes the rows itself); queried by the chat tool `search_documents` (cosine search directly against Postgres from `apps/ai/app/modules/execution/executor.py`).

| Column          | Type                              | Notes                                 |
| --------------- | ---------------------------------- | --------------------------------------- |
| `id`            | `text` (CUID2)                    | Primary key                            |
| `vault_file_id` | `text` FK → vault_files (cascade) | Required                               |
| `workspace_id`  | `text` FK → workspaces            | Required                               |
| `content`       | `text`                            | Raw text chunk (~1000 chars)           |
| `embedding`     | `vector(1536)`                    | Embedding vector                       |
| `chunk_index`   | `integer`                         | Position within the source file        |
| `token_count`   | `integer`                         | Estimated token count                  |
| `created_at`    | `timestamp`                       | Auto                                    |
| `deleted_at`    | `timestamp`                       | Soft delete                            |

### `ai_knowledge_chunks` table — global advisor knowledge base

**Not workspace-scoped.** A separate, second RAG corpus for the `/advisor` endpoint only — general financial-advice content seeded from markdown docs via `apps/ai/scripts/seed_knowledge.py`, queried by `apps/ai/app/modules/advisor/retriever.py`. This is a distinct pipeline from `vault_file_chunks` above; the two are never mixed in a single search. No caller for `POST /advisor` was found in `apps/api` or `apps/app` during this audit — verify before assuming it's wired to a live UI feature.

| Column        | Type           | Notes         |
| ------------- | -------------- | --------------- |
| `id`          | `text` (CUID2) | Primary key   |
| `source`      | `text`         | Doc/source name |
| `content`     | `text`         | Chunk text    |
| `embedding`   | `vector(1536)` | Embedding vector |
| `chunk_index` | `integer`      | Position within source |
| `created_at`  | `timestamp`    | Auto          |

---

## API Endpoints

### `apps/ai` (Python/FastAPI, port 3004) — base path is the router prefix shown

Every router except `GET /health` requires `x-api-key: AI_SERVICE_API_KEY` (`require_api_key`, applied globally in `main.py`). **`/chat/web` and `/chat/web/stream` additionally verify an `oewang-session` JWT** in the `Authorization` header (`app/core/auth.py`'s `get_auth()`) — every other route trusts the caller's `workspace_id`/`user_id` in the request body (service-to-service only). Rate limit: 120 req/min per IP (`slowapi`, in-memory, single-replica).

| Method | Path                            | Auth             | Description                                                                                          |
| ------ | -------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| `GET`  | `/health`                       | none             | Liveness check                                                                                        |
| `POST` | `/chat`                         | x-api-key        | **Legacy, no tool loop.** One-shot reply using `chatbot/prompts.py`'s persona + balance/recent-txn context |
| `POST` | `/chat/stream`                  | x-api-key        | Streaming variant of `/chat` — same no-tool-loop path. **Never use for Telegram** (see Known Constraints) |
| `POST` | `/chat/title`                   | x-api-key        | Generate a short session title from the first message                                                |
| `POST` | `/chat/web`                     | JWT              | Full tool-loop chat for the website. Runs `chat_begin`/`chat_end` (money path) + the 40-tool loop      |
| `POST` | `/chat/web/stream`              | JWT              | Streaming SSE variant of `/chat/web`                                                                   |
| `POST` | `/draft/latest-state`           | x-api-key        | Find a pending receipt draft in a message history                                                     |
| `POST` | `/draft/handle-pending`         | x-api-key        | Handle confirm/cancel/wallet-select reply to a pending draft                                          |
| `POST` | `/draft/build-from-attachments` | x-api-key        | OCR new receipt attachments into a draft preview                                                      |
| `POST` | `/advisor`                      | x-api-key        | Q&A against the global `ai_knowledge_chunks` knowledge base                                            |
| `POST` | `/analyze`                      | x-api-key        | LLM-classify a batch of transaction descriptions (category/intent/sentiment)                          |
| `POST` | `/anomaly`                      | x-api-key        | Scan a workspace's persisted expense history for outliers/spikes                                      |
| `POST` | `/anomaly/candidates`           | x-api-key        | Score NEW (not-yet-persisted) rows, e.g. an in-flight CSV import, against existing history             |
| `POST` | `/receipt/parse`                | x-api-key        | Receipt OCR → structured transaction + line items                                                     |
| `POST` | `/import/extract`               | x-api-key        | Extract transactions from raw CSV/XLSX bytes or pre-parsed rows                                       |
| `POST` | `/import/review-rows`           | x-api-key        | Suggest category/type fixes for already-mapped CSV wizard rows                                        |
| `POST` | `/vault/chunk`                  | x-api-key        | Extract text + chunk + embed one file (for `vault_file_chunks`)                                       |
| `GET`  | `/tools/definitions`            | x-api-key        | Canonical tool JSON schemas (`WEB_TOOLS`) — feeds apps/api's MCP server registration                  |
| `POST` | `/tools/execute`                | x-api-key        | Execute one tool by name (DB write + audit + canvas rule) — used by the MCP server                    |
| `POST` | `/chat/run`                     | x-api-key        | Run the tool loop given a pre-built system prompt + history (Telegram + in-process fallback)          |
| `POST` | `/internal/quota/reset-all`     | x-api-key        | Bulk monthly token-quota reset for free-plan workspaces (worker-scheduled)                             |
| `POST` | `/internal/anomaly/scan-all`    | x-api-key        | Scan every workspace and push anomalies to `ALERT_CALLBACK_URL` (worker-scheduled)                     |
| `POST` | `/internal/chat/stream`         | x-api-key        | **The** tool-loop streaming chat path for Telegram (`apps/worker`), keyed by `workspace_id`/`user_id`   |

### `apps/api` (ElysiaJS) — what's left after the chatBegin/chatEnd migration

Base path `/v1/ai`, JWT-authed (`authPlugin`) unless noted.

| Method | Path                          | Description                                                                                          |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `GET`  | `/sessions`                   | List chat sessions for the workspace                                                                  |
| `GET`  | `/sessions/:id`                | Get all messages in a session                                                                        |
| `GET`  | `/sessions/:id/metadata`       | Get session metadata (title, timestamps)                                                              |
| `GET`  | `/quota`                      | Get token usage + quota (Redis-cached 60s display value — enforcement always reads apps/ai's own DB check) |
| `POST` | `/parse-receipt`               | Standalone receipt parse for non-chat callers (Gmail/Outlook integrations) — forwards to apps/ai's `/receipt/parse` |
| `GET`  | `/agent-settings`              | Get workspace AI agent configuration                                                                  |
| `PUT`  | `/agent-settings`              | Update AI agent configuration (Redis-cached 5 min, busted on write)                                    |
| `GET`  | `/internal/system-prompt`      | `x-api-key` only. Builds the website system prompt — **appears unused now**; apps/ai builds its own tool-loop prompt in-process via `prompts_web.py` |
| `POST` | `/internal/notify-usage`       | `x-api-key` only. Fire-and-forget ping from apps/ai's `chat_end_core` so `RealtimeService` (an in-process EventEmitter Python can't reach directly) can push a live update |

---

## Business Logic

### Two chat paths — legacy vs tool loop

- **Legacy, no tools** (`POST /chat`, `/chat/stream`, `/chat/title`): `chatbot/service.py`'s `chat()`/`stream_chat()`. Builds one system prompt from `chatbot/prompts.py` + `core/persona.md` (workspace balance + last 10 transactions baked in as text), then a single (non-tool) completion via `llm.complete_metered`/`complete_metered_stream`. No mutation capability — read-only Q&A. **Must never be used for Telegram** (per `apps/ai/app/api/routes/internal.py`'s comment and the worker's `aiclient/stream.go`, which points only at `/internal/chat/stream`).
- **Tool loop** (`POST /chat/web[/stream]`, `POST /internal/chat/stream`, `POST /chat/run`): the money path (`chat_money_path.py`) resolves identity/session/quota/prompt, then `llm.complete_with_tools`/`complete_with_tools_stream` (`core/llm.py`) runs an up-to-`AI_MAX_STEPS`-step (default 10) loop against all 40 `WEB_TOOLS`, forwarding each tool call to `execution/executor.py`. The streaming variant also parses `reasoning_content` deltas and inline `<think>...</think>` tags (DeepSeek-R1/Qwen-style reasoning models) into a separate `thinking` SSE event.

### Money path — `chat_money_path.py`

`chat_begin_core(workspace_id, user_id, messages, session_id)` runs entirely in-process against Postgres (no TS round trip):

1. Create or load the session; persist the user's message.
2. **Receipt-draft short-circuit**, in order: (a) a pending draft awaiting confirm/cancel/wallet-select reply (`draft.get_latest_draft_state` + `handle_pending_invoice_draft`); (b) new receipt-looking attachments → OCR into a draft preview (`build_invoice_draft_from_attachments`), unless the message text signals "this isn't a receipt" (`is_document_upload_intent`); (c) any other attachment → saved straight to the vault, no OCR (`build_vault_upload_from_attachments`). Any of these returns `{"kind": "early", ...}` and the LLM is never called.
3. Otherwise, fetch (concurrently, via `asyncio.gather`) the token quota check, workspace currency, agent settings, and wallets/categories snapshot, then build the tool-loop system prompt.

`chat_end_core` persists the assistant reply (with `artifacts`/`provider` in `attachments`) and atomically increments `ai_tokens_used`.

The confirm/cancel/document-intent detection in `draft.py` is **regex-based, not LLM-based** (`_CONFIRM_RE`, `_CANCEL_RE`, `_DOCUMENT_INTENT_RE`) — it can misfire on ambiguous phrasing.

### System prompt — two independent builders

- `chatbot/prompts.py` + `core/persona.md`: legacy path only.
- `chatbot/prompts_web.py`'s `build_system_prompt()`: the tool-loop prompt. A large, **deliberately static, zero-interpolation body** (byte-for-byte, to stay inside OpenAI's automatic prompt-caching prefix — see the file's own comment: don't reword without checking the cache-eligibility tradeoff), plus a per-turn "# Session Context" suffix with today's date, currency, language rule (from `response_language`), `custom_instructions`, and a live wallets/categories snapshot (so the model rarely needs to call `get_workspace_context`).

### Available tools — 40 total (`chatbot/tools.py` → `WEB_TOOLS`)

**Read tools**

| Tool                        | Purpose                                                   |
| --------------------------- | ------------------------------------------------------------ |
| `get_workspace_context`     | Wallets + categories + currency (rarely needed — already injected in the prompt) |
| `get_recent_transactions`   | Recent transactions, optional date range                    |
| `get_outstanding_debts`     | Unpaid debts/receivables                                     |
| `search_contacts`           | Find a contact by name                                       |
| `search_transaction_items`  | Purchase history by product/brand                           |
| `recall_transaction`        | Infer usual price/wallet/category for a short "buy X" phrase |
| `list_documents`            | List vault files, optional name search                       |
| `search_documents`          | Cosine search over `vault_file_chunks` (RAG)                 |

**Write / mutation tools**

`create_transaction` · `update_transaction` · `delete_transaction` · `create_debt` · `pay_debt` · `update_debt` · `delete_debt` · `create_contact` · `update_contact` · `delete_contact` · `set_default_wallet` · `create_wallet` · `update_wallet` · `delete_wallet` · `create_wallet_group` · `update_wallet_group` · `delete_wallet_group` · `split_bill` · `create_budget` · `update_budget` · `delete_budget` · `add_transaction_items` · `rename_document` · `delete_document`

**Analysis tools** (trigger a canvas artifact when the payload crosses a threshold — `execution/executor.py`'s `_ARTIFACTS` map)

| Tool                  | Canvas type        | Threshold                         |
| --------------------- | ------------------- | ------------------------------------ |
| `getSpendingAnalysis` | `spending-canvas`   | `metrics.totalSpending > 0`        |
| `getRevenueSummary`   | `revenue-canvas`    | `metrics.totalRevenue > 0`         |
| `getBurnRate`         | `burn-rate-canvas`  | `metrics.avgMonthlyBurn > 0`       |
| `getDebtAnalysis`     | `debt-canvas`       | `metrics.count > 0`                |
| `getBudgetStatus`     | `budget-canvas`     | `budgets` is non-empty              |

**File-attachment tools** (always attach when the tool succeeds, `type: "file-attachment"`)

`export_transactions` (CSV export) · `get_receipt_attachment` (re-send a receipt already on a transaction)

**UI-only tool**

`present_choices` — no DB/audit; the frontend renders clickable follow-up buttons from the tool-call args directly.

### RAG — two independent pipelines

1. **Per-workspace document search** (`search_documents` tool): `apps/api`'s `VaultIndexingService.indexBuffer()` calls apps/ai's `POST /vault/chunk` (`modules/vault/chunking.py`: `extract_text` for PDF/XLSX/CSV/text/JSON/XML via `pypdf`/`openpyxl`, `chunk()` into ~1000-char/200-char-overlap pieces) then writes `vault_file_chunks` itself. At query time `executor.py`'s `_search_documents` embeds the query and does a cosine `<=>` search directly against Postgres, keeping only results with similarity ≥ 0.3 (top 5 by default).
2. **Global advisor knowledge base** (`POST /advisor`): `advisor/retriever.py`'s `search()` does the same cosine search but against `ai_knowledge_chunks` (min similarity 0.3, k=4), seeded by `apps/ai/scripts/seed_knowledge.py`. `advisor/service.py` combines the retrieved chunks with the workspace's top-5 spending categories and answers via `llm.complete_metered`.

**Supported file types for vault indexing:** any `text/*`, PDF, XLSX/XLS, JSON, XML (`chunking.is_indexable`). Images and other binary types are not indexed.

### Token quota (`core/quota.py`)

Same numbers as the plan seed data (`packages/database/scripts/seeders/01-plans.ts`):

| Plan     | Monthly tokens (`max_ai_tokens`) |
| -------- | ---------------------------------- |
| Starter  | 1,000,000                          |
| Personal | 3,000,000                          |
| Pro      | 10,000,000                         |
| Business | 40,000,000                         |

`max_tokens = plan.max_ai_tokens + workspaces.extra_ai_tokens + SUM(active AI-type addon max_ai_tokens)`. Free-plan workspaces get a **calendar-month, day-of-month-clamped** reset (`_add_monthly_reset`, e.g. Jan 31 + 1 month → Feb 28/29) checked lazily on `check_quota()`, plus a daily bulk sweep via `POST /internal/quota/reset-all` (worker-scheduled). `MOCK_AI_QUOTA=true` bypasses enforcement (dev only); `AI_QUOTA_EXEMPT_WORKSPACE_IDS` exempts specific workspaces. Over quota → `quota.PlanLimitReached`, surfaced as HTTP `422 {"error": "PLAN_LIMIT_REACHED", "meta": {"reset_at": ...}}` (a FastAPI exception handler in `main.py` catches it globally; the tool-loop routes also catch it explicitly for the SSE `error` event shape). **Embedding calls (RAG search, vault chunking) are never quota-checked or metered** — only LLM chat/completion calls go through `check_quota`/`record_usage`.

### Receipt parsing (`modules/receipt/service.py`)

Vision-capable chat completion with strict JSON-schema structured output (`response_format: json_schema`). PDFs go through `pypdf` text extraction first (capped at 12,000 chars) and skip the vision call entirely if text was found; images are downscaled to a 1536px max dimension via Pillow before being sent (fails open — sends the original on any Pillow error). A currency-scale heuristic multiplies IDR/VND-style shorthand item prices by 1000 when that reconciles the item sum with the receipt total. No cross-provider fallback (the old Gemini/Claude branches were dropped in this port).

### CSV/XLSX import (`modules/imports/{service,review}.py`)

`parse_file_to_rows` turns raw CSV/XLSX bytes into header→value dicts; `extract_transactions` classifies them into transactions via a strict JSON-schema completion, matching wallet/category names against the workspace's real lists where possible. `review_rows` is a separate path: it takes rows the CSV import wizard already field-mapped and only suggests category/type-sign fixes, capped at `MAX_ROWS`.

### Anomaly detection (`modules/anomaly/{service,model}.py`)

`sklearn`'s `IsolationForest` scores (amount, day-of-week, category-code) tuples. `detect()` (the scheduled per-workspace scan, `POST /anomaly`, worker-triggered via `/internal/anomaly/scan-all`) flags per-transaction outliers plus per-category month-over-month spikes, and POSTs results to `ALERT_CALLBACK_URL` if anomalies are found. `detect_candidates()` (`POST /anomaly/candidates`) scores NEW, not-yet-persisted rows (e.g. an in-flight CSV import) against the same history, fit once over the combined set; it has a cold-start guard — skips scoring entirely if the workspace has fewer than 30 historical expense rows, since IsolationForest on a tiny/no baseline flags noise, not signal.

### Transaction classifier (`modules/analyzer/service.py`)

`POST /analyze` classifies a batch of raw transaction descriptions into `{category, merchant, intent, sentiment}` via one LLM call with a strict-JSON-array response, validated against the workspace's real category list (falls back to `Other`/first valid category, `other` intent, `neutral` sentiment on anything the model returns outside the allowed sets).

### Session titling

`generate_title()` (`chatbot/service.py`) is called two ways: directly from `POST /chat/title`, and as a fire-and-forget `asyncio.create_task` (`_upgrade_title`) right after `chat_begin_core` creates a brand-new session — the session starts with a truncated first-message title and is renamed once the LLM call finishes, without blocking the reply.

### Agent settings caching

Unlike `apps/api`'s 5-minute Redis cache (`AgentSettingsService.getCached`, key `oewang:ai-settings:{workspaceId}`, busted on `PUT /agent-settings`), **`apps/ai` has no Redis client at all** — `core/agent_settings.py`'s `get_or_create()` runs one query per chat turn. This is a deliberate simplification (same precedent as `core/auth.py`'s uncached JWT lookup), not a bug.

### Receipt-image vault upload (`core/vault.py`)

A scoped-down port of `VaultService.uploadFile`: system-bucket-only (R2/S3-compatible, no per-workspace custom bucket support), SHA-256 dedup against existing `vault_files` rows, and a storage-quota check (`vault_size_used_bytes` vs plan `max_vault_size_mb` + addons) before every PUT. Used by the receipt-draft flow (`draft.py`) and the general non-receipt-attachment save path; both are best-effort — callers catch failures and continue rather than blocking the chat reply.

---

## Source Files

| Layer                     | File                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| Schema                    | `packages/database/schema/ai-sessions.ts`                                                     |
| Schema                    | `packages/database/schema/ai-messages.ts`                                                     |
| Schema                    | `packages/database/schema/ai-agent-settings.ts`                                               |
| Schema                    | `packages/database/schema/vault-file-chunks.ts`                                               |
| Schema                    | `packages/database/schema/ai-knowledge-chunks.ts`                                             |
| Service bootstrap         | `apps/ai/app/main.py`, `apps/ai/app/config.py`                                                |
| Auth middleware           | `apps/ai/app/api/middleware/auth.py` (x-api-key), `apps/ai/app/core/auth.py` (JWT)             |
| Chat routes               | `apps/ai/app/api/routes/{chatbot,draft,internal}.py`                                          |
| Feature routes            | `apps/ai/app/api/routes/{advisor,analyzer,anomaly,capabilities}.py`                            |
| Chat service + money path | `apps/ai/app/modules/chatbot/{service,chat_money_path,draft,memory}.py`                       |
| System prompts            | `apps/ai/app/modules/chatbot/{prompts,prompts_web}.py`, `apps/ai/app/core/persona.md`         |
| Tool schemas + chat_begin/end | `apps/ai/app/modules/chatbot/tools.py`                                                      |
| Tool execution / dispatch | `apps/ai/app/modules/execution/executor.py`                                                   |
| Tool handlers             | `apps/ai/app/modules/execution/{transactions,wallets,budgets,debts,categories,contacts,items,attachments,exports,analysis,resolvers}.py` |
| LLM client + tool loop    | `apps/ai/app/core/llm.py`                                                                     |
| Embeddings                | `apps/ai/app/core/embeddings.py`                                                              |
| Quota                     | `apps/ai/app/core/quota.py`                                                                   |
| Sessions repository       | `apps/ai/app/core/sessions.py`                                                                |
| Agent settings repository | `apps/ai/app/core/agent_settings.py`                                                          |
| Vault upload side effect  | `apps/ai/app/core/vault.py`                                                                   |
| Audit log                 | `apps/ai/app/core/audit.py`                                                                   |
| Currency formatting       | `apps/ai/app/core/currency.py`                                                                |
| Vault chunking (RAG #1)   | `apps/ai/app/modules/vault/chunking.py`                                                       |
| Advisor + retriever (RAG #2) | `apps/ai/app/modules/advisor/{service,retriever}.py`                                        |
| Analyzer                  | `apps/ai/app/modules/analyzer/service.py`                                                     |
| Anomaly detection         | `apps/ai/app/modules/anomaly/{service,model}.py`                                              |
| CSV/XLSX import           | `apps/ai/app/modules/imports/{service,review}.py`                                             |
| Receipt OCR               | `apps/ai/app/modules/receipt/service.py`                                                      |
| Request/response schemas  | `apps/ai/app/schemas/*.py`                                                                    |
| DB pool (asyncpg)         | `apps/ai/app/core/database.py`                                                                |
| Public controller/service | `apps/api/modules/ai/{ai.controller,ai.service,ai.repository}.ts`                             |
| Sidecar HTTP client       | `apps/api/modules/ai/ai-sidecar-client.ts`                                                    |
| Internal (service-to-service) controller | `apps/api/modules/ai/ai-internal.controller.ts`                               |
| Agent settings (TS side)  | `apps/api/modules/ai/agent-settings.{dto,repository,service,controller}.ts`                   |
| Vault indexing trigger    | `apps/api/modules/vault/vault-indexing.service.ts`                                            |
| Worker Telegram handler   | `apps/worker/internal/tasks/webhook_telegram.go`                                              |
| Worker AI client          | `apps/worker/internal/aiclient/{aiclient,stream}.go`                                          |
| Frontend                  | `apps/app/app/(main)/[locale]/(dashboard)/chat/[id]/`                                          |

---

## Infrastructure

### pgvector setup (one-time per environment)

```bash
bun run db:setup-vector   # packages/database/setup-vector.ts
```

Creates HNSW indexes (`vector_cosine_ops`) on **both** `vault_file_chunks.embedding` and `ai_knowledge_chunks.embedding`, plus a trigram index on `contacts.name` and a GIN index on `pricing.prices`. Idempotent (`CREATE INDEX IF NOT EXISTS`) — safe to re-run after every `db:push`.

### apps/ai runtime

- FastAPI + `slowapi` in-memory rate limiting (120/min per IP) — single-replica only; ok for current scale.
- Postgres access is raw `asyncpg` (`app/core/database.py`), pool size 1–5, `pgvector.asyncpg.register_vector` registered per connection so Python lists round-trip as `vector(1536)` columns directly. This is deliberately **not** an ORM — the schema stays Drizzle/TS-owned; Python just runs SQL against the same tables with workspace-scoping and soft-delete enforced per query.
- No Redis client anywhere in `apps/ai` — every cache the TS side has (auth, agent settings) is a plain per-call DB read here.
- The Go worker (`apps/worker`) owns the periodic anomaly scan and the daily quota-reset sweep by calling `/internal/anomaly/scan-all` and `/internal/quota/reset-all` on a cron cadence — there is no in-process `AsyncIOScheduler` in `apps/ai` anymore (`main.py`'s comment is explicit about this).

---

## Known Constraints

- `ai_agent_settings.model` / `.temperature` / `.max_steps` are stored and editable via `apps/api`'s `PUT /v1/ai/agent-settings`, but **`apps/ai`'s actual chat loop never reads them** — the model comes from the `AI_CHAT_MODEL` env var, temperature is hardcoded to `0.7`, and step count comes from `AI_MAX_STEPS`. Only `custom_instructions` and `response_language` are actually plumbed into the tool-loop system prompt. Treat the other three fields as vestigial until someone wires them through.
- `/chat` and `/chat/stream` (legacy, `chatbot/prompts.py`) run **no tool loop** — no mutations, no canvas, no RAG. Do not point Telegram or any new integration at them; only `/internal/chat/stream` (worker) and `/chat/run` (via `/tools/execute`) carry the full 40-tool loop. This mirrors the explicit warning already in `CLAUDE.md` and in the route/client code comments themselves.
- Two separate, non-overlapping RAG corpora exist: `vault_file_chunks` (per-workspace, used by the `search_documents` chat tool) and `ai_knowledge_chunks` (global, used only by `POST /advisor`). No caller of `POST /advisor` was found in `apps/api` or `apps/app` during this audit — verify whether it's actually wired to a live feature before relying on that assumption either way.
- Embedding calls (vault chunk indexing, `search_documents`, `/advisor`) are **never checked against or metered from the workspace's AI token quota** — only LLM chat/completion/vision calls go through `quota.check_quota`/`record_usage`.
- Receipt parsing and CSV extraction fail **soft** (return `None`/`[]`) when the model client looks unconfigured, unlike quota enforcement which fails **closed**. `AI_SERVICE_API_KEY` unset makes every non-`/health` route return `503` (fail closed) — the two failure modes are intentionally different.
- Receipt vision parsing requires a vision-capable model configured as `AI_VISION_MODEL`; there is no automatic cross-provider fallback (the old Gemini/Claude fallback branches were dropped in this port).
- `AI_EMBED_MODEL` defaults to `"coder"` in `apps/ai/app/config.py` — a chat-oriented model name, not obviously an embeddings model. Every environment must override this to an actual embedding-capable model; the `vector(1536)` column width assumes one that returns 1536-dim vectors (e.g. `text-embedding-3-small`-compatible).
- The confirm/cancel/"not a receipt" detection in the draft flow (`draft.py`) is regex-based pattern matching on the user's raw text, not an LLM call — it can misfire on phrasing outside its patterns.
- Anomaly candidate scoring (`detect_candidates`) requires at least 30 historical expense rows for the workspace before it will score anything; below that it returns no anomalies rather than fitting IsolationForest on too little data.
- `JWT_SECRET` must be byte-identical across `apps/ai`, `apps/api`, `apps/app`, and `apps/admin` (HS256, shared secret) — `apps/ai`'s JWT verification (`core/auth.py`) has no Redis cache (unlike the TS side's 30s `auth:user:<id>` cache), so every web chat turn re-runs the user+membership JOIN query once.
- Document indexing only covers text-extractable types (`text/*`, PDF, XLSX/XLS, JSON, XML) — images and other binary formats are never indexed for RAG, even though they can still be uploaded to the vault.
