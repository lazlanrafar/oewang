# Feature: AI Assistant

> See also: [CLAUDE.md](../CLAUDE.md) · [FEAT_TRANSACTIONS.md](./FEAT_TRANSACTIONS.md) · [FEAT_VAULT.md](./FEAT_VAULT.md) · [FEAT_BILLING.md](./FEAT_BILLING.md)

---

## 🤖 AI Agent: Update This Doc When

- Modifying `packages/database/schema/ai-sessions.ts` or `ai-messages.ts`
- Adding AI tools in `apps/api/modules/ai/ai.tools.ts`
- Changing AI orchestration in `apps/api/modules/ai/ai.service.ts`
- Adding new AI model providers to `packages/ai/`
- Changing token quota limits in `packages/constants/`

---

## Purpose

The AI Assistant is an in-app chat interface powered by multiple LLM providers (OpenAI, Anthropic Claude, Google Gemini). It understands the workspace's financial context and can create transactions, parse receipts, answer financial questions, and generate reports. Each conversation is a persistent Session stored in the database.

---

## Data Model

### `ai_sessions` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` (CUID2) | Primary key |
| `workspace_id` | `text` FK → workspaces | Required |
| `title` | `text` | Session title (auto-generated from first message) |
| `created_at` | `timestamp` | Auto |
| `updated_at` | `timestamp` | Auto |
| `deleted_at` | `timestamp` | Soft delete |

### `ai_messages` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` (CUID2) | Primary key |
| `session_id` | `text` FK → ai_sessions (cascade) | Required |
| `workspace_id` | `text` | Required (denormalized for fast queries) |
| `role` | enum | `user` \| `assistant` \| `system` |
| `content` | `text` | Message text content |
| `attachments` | `jsonb` | Optional array of file attachments `{ name, url, type, size }` |
| `created_at` | `timestamp` | Auto |
| `deleted_at` | `timestamp` | Soft delete |

---

## API Endpoints

Base path: `/v1/ai`

| Method | Path | Role Required | Description |
|--------|------|--------------|-------------|
| `GET` | `/sessions` | Any authenticated | List all chat sessions for workspace |
| `GET` | `/sessions/:id` | Any authenticated | Get all messages in a session |
| `GET` | `/sessions/:id/metadata` | Any authenticated | Get session metadata (title, timestamps) |
| `DELETE` | `/sessions/:id` | Any authenticated | Delete a session and all its messages |
| `GET` | `/quota` | Any authenticated | Get token usage + quota for current period |
| `POST` | `/chat` | Any authenticated | Send a message and get AI response |
| `POST` | `/parse-receipt` | Any authenticated | Parse a receipt image/PDF into transaction data |

---

## Business Logic

### Multi-Model Orchestration

`packages/ai` contains the `AiOrchestrator` which selects the appropriate LLM based on:
- Task type (chat vs. receipt parsing vs. function calling)
- Availability of API keys
- Model capability requirements

Supported providers: **OpenAI GPT-4o**, **Anthropic Claude 3.5 Sonnet**, **Google Gemini 1.5 Pro**

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
2. Sends to vision-capable LLM (GPT-4o or Gemini)
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
4. The client presents this as a prefilled transaction form for confirmation

### Tool Calling (Function Calling)

The AI can call workspace tools during a conversation:
- `create_transaction` — create an expense/income/transfer
- `get_wallet_balance` — fetch current balances
- `get_recent_transactions` — retrieve transaction history
- `get_category_spending` — spending breakdown by category

Tools are defined in `apps/api/modules/ai/ai.tools.ts`. After each tool execution, the result is appended to the message thread and the conversation continues.

### Session Management

- A session is created on the first `POST /chat` if no `sessionId` is provided
- Session `title` is auto-generated from the first user message (truncated to 60 chars)
- Sessions are workspace-scoped — users see all sessions for their workspace
- Messages are stored with `workspace_id` for fast workspace-scoped queries

### Redis Caching

The AI service uses Redis to cache:
- Draft invoice/receipt state (`invoice_draft:{workspaceId}`) during multi-turn receipt confirmation flows
- Rate-limit state for AI endpoints (separate from global rate limiter)

---

## Source Files

| Layer | File |
|-------|------|
| Schema | `packages/database/schema/ai-sessions.ts` |
| Schema | `packages/database/schema/ai-messages.ts` |
| Controller | `apps/api/modules/ai/ai.controller.ts` |
| Service | `apps/api/modules/ai/ai.service.ts` |
| Repository | `apps/api/modules/ai/ai.repository.ts` |
| Tools | `apps/api/modules/ai/ai.tools.ts` |
| DTOs | `apps/api/modules/ai/ai.dto.ts` |
| Utils | `apps/api/modules/ai/ai.utils.ts` |
| Tests | `apps/api/modules/ai/ai.utils.test.ts` (69 tests) |
| AI packages | `packages/ai/` — AiOrchestrator, ReceiptService |
| Frontend | `apps/app/app/(main)/[locale]/(dashboard)/chat/[id]/` |

---

## Known Constraints

- Vision-based receipt parsing requires either OpenAI or Gemini API key (Claude does not support PDF natively in this integration).
- Token counting is approximate (model-side). Actual usage may vary slightly from stored counts.
- The AI cannot directly access the database — it goes through tool functions, which call the actual service layer.
- Receipt parsing creates a **draft** — the user must confirm before the transaction is actually saved.
- `extra_ai_tokens` (from add-ons) are consumed only after the plan's base quota is exhausted.
