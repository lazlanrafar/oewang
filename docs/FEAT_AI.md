# Feature: AI Assistant

> See also: [CLAUDE.md](../CLAUDE.md) · [FEAT_TRANSACTIONS.md](./FEAT_TRANSACTIONS.md) · [FEAT_VAULT.md](./FEAT_VAULT.md) · [FEAT_BILLING.md](./FEAT_BILLING.md) · [REFERENCE_MIDDAY_AI.md](./REFERENCE_MIDDAY_AI.md)

---

## 🤖 AI Agent: Update This Doc When

- Modifying `packages/database/schema/ai-sessions.ts`, `ai-messages.ts`, `ai-agent-settings.ts`, or `vault-file-chunks.ts`
- Adding or removing tools in `packages/ai/core/ai.orchestrator.ts`
- Changing the system prompt in `packages/ai/core/prompts.ts`
- Adding new AI model providers to `packages/ai/`
- Changing token quota limits in `packages/constants/`
- Modifying the RAG pipeline in `packages/ai/embedding/` or `packages/ai/rag/`
- Changing vault indexing behavior in `apps/api/modules/vault/vault-indexing.service.ts`

---

## Purpose

The AI Assistant is an in-app chat interface powered by multiple LLM providers (OpenAI, Anthropic Claude). It understands the workspace's financial context and can create transactions, parse receipts, answer financial questions, generate reports, and search the contents of uploaded vault documents. Each conversation is a persistent Session stored in the database.

---

## Data Model

### `ai_sessions` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` (CUID2) | Primary key |
| `workspace_id` | `text` FK → workspaces | Required |
| `title` | `text` | Auto-generated from first message |
| `created_at` | `timestamp` | Auto |
| `updated_at` | `timestamp` | Auto |
| `deleted_at` | `timestamp` | Soft delete |

### `ai_messages` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` (CUID2) | Primary key |
| `session_id` | `text` FK → ai_sessions (cascade) | Required |
| `workspace_id` | `text` | Denormalized for fast workspace queries |
| `role` | enum | `user` \| `assistant` \| `system` |
| `content` | `text` | Message text content |
| `attachments` | `jsonb` | File attachments `{ name, url, type, size }` or artifact/provider metadata |
| `created_at` | `timestamp` | Auto |
| `deleted_at` | `timestamp` | Soft delete |

### `ai_agent_settings` table

One row per workspace. Created automatically on first use with sensible defaults.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | `text` (CUID2) | — | Primary key |
| `workspace_id` | `text` FK → workspaces | — | Unique — one config per workspace |
| `model` | `text` | `gpt-4o-mini` | LLM model ID |
| `temperature` | `decimal(3,2)` | `0.70` | Creativity 0–1 |
| `max_steps` | `integer` | `10` | Max tool-calling steps per request |
| `custom_instructions` | `text` | `null` | Custom system prompt suffix |
| `response_language` | `text` | `auto` | `auto` \| `english` \| `indonesian` |
| `created_at` | `timestamp` | Auto | — |
| `updated_at` | `timestamp` | Auto | — |

### `vault_file_chunks` table

Stores text chunks and vector embeddings for RAG document search.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` (CUID2) | Primary key |
| `vault_file_id` | `text` FK → vault_files (cascade) | Required |
| `workspace_id` | `text` FK → workspaces | Required |
| `content` | `text` | Raw text chunk (~1000 chars) |
| `embedding` | `vector(1536)` | OpenAI text-embedding-3-small embedding |
| `chunk_index` | `integer` | Position within the source file |
| `token_count` | `integer` | Estimated token count |
| `created_at` | `timestamp` | Auto |
| `deleted_at` | `timestamp` | Soft delete |

---

## API Endpoints

Base path: `/v1/ai`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sessions` | List all chat sessions for workspace |
| `GET` | `/sessions/:id` | Get all messages in a session |
| `GET` | `/sessions/:id/metadata` | Get session metadata (title, timestamps) |
| `GET` | `/quota` | Get token usage + quota for current period |
| `POST` | `/chat` | Send a message and get AI response |
| `POST` | `/parse-receipt` | Parse a receipt image/PDF into transaction data |
| `GET` | `/agent-settings` | Get workspace AI agent configuration |
| `PUT` | `/agent-settings` | Update AI agent configuration |

### Agent Settings — PUT `/v1/ai/agent-settings`

```json
{
  "model": "gpt-4o-mini",
  "temperature": 0.7,
  "max_steps": 10,
  "custom_instructions": "Always format amounts in IDR.",
  "response_language": "auto"
}
```

| Field | Options |
|-------|---------|
| `model` | `gpt-4o-mini` · `gpt-4o` · `claude-3-5-haiku-20241022` · `claude-3-5-sonnet-20241022` |
| `temperature` | `0.0` – `1.0` |
| `max_steps` | `3` – `20` |
| `custom_instructions` | Free text (max 2000 chars), appended to system prompt |
| `response_language` | `auto` · `english` · `indonesian` |

---

## Business Logic

### Orchestration — Vercel AI SDK

`packages/ai/core/ai.orchestrator.ts` drives all chat using `generateText` from the **Vercel AI SDK** (`ai` package v4). Key design:

- **Multi-step tool loop** — `maxSteps` controls how many consecutive tool calls the AI can make in a single request. No manual while-loops.
- **Model selection** — `@ai-sdk/openai` for GPT models, `@ai-sdk/anthropic` for Claude. Selected via workspace `ai_agent_settings.model`.
- **Tools defined as Zod schemas** via `tool()` — properly typed, no raw JSON schema.
- **No intent detection** — the AI decides what data it needs by calling tools. The old `IntentService` and `ContextService.buildContextByIntent` are no longer in the main chat flow.

### System Prompt

`packages/ai/core/prompts.ts` exports `buildSystemPrompt(ctx)` which dynamically injects:
- Current date and workspace currency
- Language rule based on `response_language` setting
- Custom instructions from agent settings
- All tool-routing rules (when to fetch context, when to call analysis tools, etc.)

### Available Tools (13 tools)

**Context / read tools** (cached in Redis):

| Tool | Cache TTL | Purpose |
|------|-----------|---------|
| `get_workspace_context` | 5 min | Wallets (id, name, balance) + categories + currency settings |
| `get_recent_transactions` | 2 min | Last N transactions with wallet/category info |
| `get_outstanding_debts` | 2 min | Unpaid debts and receivables |
| `search_documents` | — | RAG search over vault file chunks |

**Action tools** (mutation):

| Tool | Purpose |
|------|---------|
| `create_transaction` | Create income / expense / transfer |
| `update_transaction` | Modify existing transaction |
| `delete_transaction` | Soft-delete a transaction |
| `create_debt` | Record hutang (payable) or piutang (receivable) |
| `split_bill` | Create expense + auto-record receivable debts per person |
| `add_transaction_items` | Attach receipt line items to a transaction |
| `search_transaction_items` | Search purchase history by product name |

**Analysis tools** (trigger canvas artifact):

| Tool | Artifact type |
|------|--------------|
| `getRevenueSummary` | `revenue-canvas` |
| `getBurnRate` | `burn-rate-canvas` |
| `getSpendingAnalysis` | `spending-canvas` |

### RAG — Document Search

When a vault file is uploaded, the AI module automatically indexes it in the background:

```
Upload → VaultIndexingService.indexBuffer()
  → ChunkingService.extractText()   — PDF/XLSX/TXT/CSV → plain text
  → ChunkingService.chunk()         — split into ~1000-char chunks (200-char overlap)
  → EmbeddingService.embed()        — batch call to OpenAI text-embedding-3-small
  → INSERT vault_file_chunks        — store chunks + 1536-dim vectors
```

At query time, the AI calls `search_documents(query)`:
```
EmbeddingService.embedQuery(query)
  → RagRepository.similaritySearch()  — pgvector <=> cosine distance
  → top-5 chunks returned with fileName + relevance score
```

**Supported file types for indexing:** PDF · XLSX · XLS · CSV · TXT · MD · JSON · XML

**HNSW index** on `vault_file_chunks.embedding` for fast approximate nearest-neighbor search (created via `bun run db:setup-vector`).

### Agent Settings Caching

`AgentSettingsService.getCached()` is called on every chat request:
- Check Redis key `oewang:ai-settings:{workspaceId}` (TTL 5 min)
- On miss: query DB → cache → return
- On `PUT /agent-settings`: bust cache immediately so next request picks up new config

### Token Quota System

Each workspace has a monthly AI token budget:

| Plan | Monthly tokens |
|------|----------------|
| Free (starter) | 100 tokens |
| Pro | 1,000 tokens |
| Business | 10,000 tokens |
| Add-on | Purchasable extra tokens |

Quota fields on `workspaces`:
- `ai_tokens_used` — tokens consumed this period
- `ai_tokens_reset_at` — when the counter resets (monthly)
- `extra_ai_tokens` — tokens from purchased add-ons (do not reset)

Before every AI call, `AiService` checks quota. If exceeded → `422 + ErrorCode.PLAN_LIMIT_EXCEEDED`.

### Receipt Parsing

`POST /v1/ai/parse-receipt` uses `packages/ai/ReceiptService`:
1. Accepts an image (JPEG, PNG) or PDF
2. Sends to vision-capable LLM (GPT-4o or Gemini) with provider fallback
3. Returns structured transaction draft:
   ```json
   {
     "amount": 45.50,
     "date": "2025-01-15",
     "name": "Starbucks",
     "categoryId": "...",
     "items": [{ "name": "Latte", "quantity": 1, "amount": 6.50 }]
   }
   ```
4. Client presents as a prefilled form; user must confirm before saving

### Session Management

- Session created on first `POST /chat` if no `sessionId` provided
- Title auto-generated from first message via `gpt-4o-mini` (or `claude-3-5-haiku` fallback)
- Sessions are workspace-scoped
- Messages stored with `workspace_id` for fast workspace-scoped queries

### Redis Cache Keys

| Key | TTL | Content |
|-----|-----|---------|
| `oewang:ai-settings:{workspaceId}` | 5 min | Agent settings (model, temp, instructions) |
| `oewang:ws-ctx:{workspaceId}` | 5 min | Wallets + categories + currency settings |
| `oewang:ws-txns:{workspaceId}:{limit}:{from}:{to}` | 2 min | Recent transactions list |
| `oewang:ws-debts:{workspaceId}` | 2 min | Outstanding debts |
| `oewang:category-cache:{workspaceId}:{name}` | 30 days | Category ID by merchant name |

Context caches are busted when a mutation tool (`create_transaction`, `delete_transaction`, `split_bill`) succeeds.

---

## Source Files

| Layer | File |
|-------|------|
| Schema | `packages/database/schema/ai-sessions.ts` |
| Schema | `packages/database/schema/ai-messages.ts` |
| Schema | `packages/database/schema/ai-agent-settings.ts` |
| Schema | `packages/database/schema/vault-file-chunks.ts` |
| Controller | `apps/api/modules/ai/ai.controller.ts` |
| Service | `apps/api/modules/ai/ai.service.ts` |
| Repository | `apps/api/modules/ai/ai.repository.ts` |
| Tools executor | `apps/api/modules/ai/ai.tools.ts` |
| Agent settings | `apps/api/modules/ai/agent-settings.{dto,repository,service,controller}.ts` |
| DTOs | `apps/api/modules/ai/ai.dto.ts` |
| Utils | `apps/api/modules/ai/ai.utils.ts` |
| Tests | `apps/api/modules/ai/ai.utils.test.ts` (69 tests) |
| Orchestrator | `packages/ai/core/ai.orchestrator.ts` |
| System prompt | `packages/ai/core/prompts.ts` |
| Embedding | `packages/ai/embedding/embedding.service.ts` |
| Chunking | `packages/ai/embedding/chunking.service.ts` |
| RAG repository | `packages/ai/rag/rag.repository.ts` |
| Vault indexing | `apps/api/modules/vault/vault-indexing.service.ts` |
| Receipt parser | `packages/ai/receipt/receipt.service.ts` |
| Frontend | `apps/app/app/(main)/[locale]/(dashboard)/chat/[id]/` |

---

## Infrastructure

### pgvector Setup (one-time per environment)

```bash
# 1. Enable extension + create HNSW index
bun run db:setup-vector

# For local Docker — use pgvector-enabled image:
# docker-compose.yml already updated to pgvector/pgvector:pg16
```

Railway production: pgvector extension was enabled and HNSW index created on June 2025. The `bun run db:setup-vector` script is idempotent and safe to re-run.

---

## Known Constraints

- Vision-based receipt parsing requires OpenAI or Gemini API key (Claude does not support PDF natively in this integration).
- Token counting is approximate (model-side). Actual usage may vary slightly from stored counts.
- The AI cannot directly access the database — it goes through tool functions which call the actual service layer.
- Receipt parsing creates a **draft** — the user must confirm before the transaction is saved.
- `extra_ai_tokens` (from add-ons) are consumed only after the plan's base quota is exhausted.
- Document indexing (`search_documents`) requires `OPENAI_API_KEY`. If the key is absent, indexing is silently skipped and the tool returns an error message.
- Images and unsupported binary formats are not indexed for RAG — only text-extractable file types.
- The HNSW index requires pgvector ≥ 0.5.0. If the index creation fails, fall back to exact IVFFlat search (still functional, just slower at scale).
