# Feature: External Messaging Integrations (Telegram)

> See also: [CLAUDE.md](../CLAUDE.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [FEAT_AI.md](./FEAT_AI.md) · [FEAT_VAULT.md](./FEAT_VAULT.md) · [FEAT_TRANSACTIONS.md](./FEAT_TRANSACTIONS.md)

---

## 🤖 AI Agent: Update This Doc When

- Modifying the integration schema in `packages/database/schema/workspace-integrations.ts`
- Adding endpoints or changes in `apps/api/modules/integrations/integrations.controller.ts`
- Modifying the connect/disconnect flow in `apps/api/modules/integrations/integrations.service.ts`
- Modifying webhook security check code in `apps/api/modules/integrations/webhook-security.ts`
- Modifying the Telegram webhook state machine in `apps/worker/internal/tasks/webhook_telegram.go` (message processing now lives entirely in the Go worker, not apps/api — see below)
- Adding integration configuration tabs/views to `apps/app/`

---

## Purpose

The External Integrations system connects the workspace to Telegram. This enables users to send messages (receipts/bills) directly to their workspace via Telegram, which are processed by AI to automatically extract expenses and create transaction attachments. Users can also chat with their AI Assistant directly via Telegram.

**Ownership split**: `apps/api` owns the connect/disconnect management API (dashboard-driven linking, listing, deactivation) and the public webhook route's signature check + enqueue. `apps/worker` (Go) owns the entire message-processing state machine — the connect-via-bot-command flow, receipt-draft OCR, and conversational chat — end to end, calling `apps/ai` and PostgreSQL directly. This split happened when the old in-process `IntegrationsService.handleTelegramWebhook` (and its `chatViaSidecarStream` SSE client) were removed from `apps/api` and fully ported to Go.

---

## Data Model

### `workspace_integrations` table

Maintains the credentials and active state of third-party bot integrations.

| Column        | Type                   | Notes                                                                     |
| ------------- | ---------------------- | ------------------------------------------------------------------------- |
| `id`          | `text` (CUID2)         | Primary key                                                               |
| `workspaceId` | `text` FK → workspaces | Workspace link (cascade delete)                                           |
| `provider`    | `text`                 | e.g. `telegram`                                                           |
| `settings`    | `jsonb`                | Provider-specific config (e.g. `{ telegramChatId }`)                      |
| `isActive`    | `boolean`              | Connection status state. Default `false`                                  |
| `connectedAt` | `timestamp`            | Time of activation                                                        |
| `connectedBy` | `text` FK → users      | Admin user who linked the channel                                         |
| `deletedAt`   | `timestamp`            | Soft delete support                                                       |

_Unique index on `(workspace_id, provider)` guarantees only one connection per provider._

---

## API Endpoints

### Public Webhooks (Unauthenticated)

These are public endpoints exposed for webhook push triggers from the Telegram Bot API.

| Method | Path                                        | Description                                                  |
| ------ | ------------------------------------------- | ------------------------------------------------------------ |
| `POST` | `/integrations/telegram/webhook`            | Verifies the secret header, then enqueues the raw update onto `apps/worker` (`POST /internal/enqueue/telegram-webhook`) and returns `200 OK` immediately — never processes the message itself |

### Admin Configuration (Authenticated)

Base path: `/v1/integrations`

| Method | Path                    | Role Required | Description                                           |
| ------ | ----------------------- | ------------- | ----------------------------------------------------- |
| `GET`  | `/`                     | Any Member    | List active integrations for the workspace            |
| `POST` | `/telegram/connect`     | Admin+        | Link a Telegram chat ID manually and activate channel |
| `POST` | `/:provider/disconnect` | Admin+        | Deactivate and disconnect a messaging integration     |

---

## Business Logic

### Connection and Linking Flows

#### Telegram Connection (bot-command flow, handled by apps/worker)

- Users trigger connection via the bot chat with the start command (`/start <workspace-id>___<user-id>` or the legacy `Connect Oewang <...>` phrase).
- `apps/worker`'s `parseTelegramConnectPayload`/`handleConnect` (`webhook_telegram.go`) extract and validate the workspace slug/id and user id, then write the connection (`workspace_integrations` upsert, `is_active=true`, `connected_at=now`) directly via Postgres, fire a "Telegram Connected" notification, and invalidate `apps/api`'s `oewang:integrations:*` cache key via the shared Redis instance.

#### Telegram Connection (dashboard-driven, handled by apps/api)

- `POST /v1/integrations/telegram/connect` still lets an admin link a chat ID manually from the dashboard UI — `IntegrationsService.connectTelegram` in TS, unchanged.

---

### Webhook Security & Signature Verification

To prevent spam and spoofing, still enforced in `apps/api` before enqueueing:

1. **Telegram Webhook Secret**: Checks the incoming header `x-telegram-bot-api-secret-token` against `TELEGRAM_WEBHOOK_SECRET`.

If signature verification fails, the endpoint immediately rejects the request with `403 Forbidden` — the message never reaches the worker's queue.

---

### AI Receipt Extraction via Messaging (apps/worker)

When a user sends an image/receipt file via Telegram, `apps/worker`'s `handleReceiptAttachment` (`webhook_telegram.go`):

1. **Download Media**: Fetches the file payload directly from the Telegram Bot API (`getFile` + file download) into memory.
2. **AI Draft Extraction**: Calls `apps/ai`'s `POST /draft/build-from-attachments` directly (base64 attachment bytes, no separate vault-upload step for this flow) — the sidecar extracts amount/date/name/items and returns a draft + a human reply.
3. **Session Logging**: Creates or reuses an `ai_sessions` row, saves the user's `[receipt photo]` message and the assistant's draft reply into `ai_messages` — all direct Postgres writes.
4. **Realtime User Confirmation**: Sends the AI's reply back via Telegram `sendMessage`.

---

### AI Conversational Assistant via Messaging (apps/worker)

When a text message is received, `apps/worker`'s `handleTextMessage`/`streamChatReply` (`webhook_telegram.go`):

1. **Draft Precedence**: If a receipt draft is awaiting confirmation for this chat's session (`apps/ai`'s `POST /draft/latest-state` reports `status: "awaiting_confirmation"`), that turn is handled by `POST /draft/handle-pending` first — normal chat is skipped.
2. **Streaming AI Reply**: Otherwise calls `apps/ai`'s `POST /chat/stream` directly and fake-streams the reply into Telegram via incremental `editMessageText` calls (throttled to ~1.3s), matching the web chat's perceived-latency behavior.
3. **Structured Commands**: If the final reply starts with a JSON transaction-draft object (e.g. `{ "amount": 20000, "name": "Susu", "walletId": "wallet1", "type": "expense" }`), `normalizeAiReplyForChat` calls `apps/ai`'s `POST /tools/execute` (`create_transaction`) and rewrites the reply into a friendly confirmation (e.g. `✅ Sudah dicatat: Susu Rp20.000 dari Kas.`).
4. **Reply Broadcast**: The final reply replaces the streaming placeholder via `editMessageText` (Markdown), or is sent fresh via `sendMessage` if no placeholder exists.

---

## Source Files

| Layer                      | File                                                             |
| -------------------------- | ------------------------------------------------------------------ |
| Schema                     | `packages/database/schema/workspace-integrations.ts`               |
| Connect/disconnect API     | `apps/api/modules/integrations/integrations.controller.ts`         |
| Connect/disconnect service | `apps/api/modules/integrations/integrations.service.ts` (only `connectTelegram`/`getAll`/`disconnectIntegration` remain — the webhook-processing methods were removed) |
| Public webhook + enqueue   | `apps/api/modules/integrations/public-webhooks.controller.ts`      |
| Repository                 | `apps/api/modules/integrations/integrations.repository.ts`         |
| Security                   | `apps/api/modules/integrations/webhook-security.ts`                |
| Security Test              | `apps/api/modules/integrations/webhook-security.test.ts`           |
| Message processing (Go)    | `apps/worker/internal/tasks/webhook_telegram.go`, `telegram_normalize.go` |
| Telegram Bot API client (Go) | `apps/worker/internal/telegram/client.go`                         |
| apps/ai sidecar client (Go) | `apps/worker/internal/aiclient/{aiclient,stream}.go`               |
| Postgres access (Go)       | `apps/worker/internal/repo/{integrations,ai_sessions}.go`           |

---

## Known Constraints & Edge Cases

- **Asynchronous Webhook Processing**: The public webhook route enqueues onto `apps/worker` (asynq, deduped by Telegram's own `update_id` as the task ID) and returns `200 OK` immediately — actual processing (downloading files, querying AI, updating DB, responding back) happens durably in the worker with retry/dead-letter, not as an in-process fire-and-forget promise.
- If `apps/worker` is unreachable when `apps/api` tries to enqueue, the webhook handler logs the error but still returns `200 OK` to Telegram (Telegram would otherwise retry-storm a failing webhook).
