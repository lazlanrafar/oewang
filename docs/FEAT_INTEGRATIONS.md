# Feature: External Messaging Integrations (WhatsApp & Telegram)

> See also: [CLAUDE.md](../CLAUDE.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [FEAT_AI.md](./FEAT_AI.md) · [FEAT_VAULT.md](./FEAT_VAULT.md) · [FEAT_TRANSACTIONS.md](./FEAT_TRANSACTIONS.md)

---

## 🤖 AI Agent: Update This Doc When

- Modifying the integration schema in `packages/database/schema/workspace-integrations.ts`
- Adding endpoints or changes in `apps/api/modules/integrations/integrations.controller.ts`
- Modifying connection, receipt uploading, or parsing logic in `apps/api/modules/integrations/integrations.service.ts`
- Modifying webhook security check code in `apps/api/modules/integrations/webhook-security.ts`
- Adding integration configuration tabs/views to `apps/app/`

---

## Purpose

The External Integrations system connects the workspace to WhatsApp (via Twilio) and Telegram. This enables users to send messages (receipts/bills) directly to their workspace via WhatsApp or Telegram, which are processed by AI to automatically extract expenses and create transaction attachments. Users can also chat with their AI Assistant directly via Telegram or WhatsApp.

---

## Data Model

### `workspace_integrations` table

Maintains the credentials and active state of third-party bot integrations.

| Column        | Type                   | Notes                                                                     |
| ------------- | ---------------------- | ------------------------------------------------------------------------- |
| `id`          | `text` (CUID2)         | Primary key                                                               |
| `workspaceId` | `text` FK → workspaces | Workspace link (cascade delete)                                           |
| `provider`    | `text`                 | e.g. `whatsapp-twilio`, `telegram`                                        |
| `settings`    | `jsonb`                | Provider-specific config (e.g. `{ phoneNumber }` or `{ telegramChatId }`) |
| `isActive`    | `boolean`              | Connection status state. Default `false`                                  |
| `connectedAt` | `timestamp`            | Time of activation                                                        |
| `connectedBy` | `text` FK → users      | Admin user who linked the channel                                         |
| `deletedAt`   | `timestamp`            | Soft delete support                                                       |

_Unique index on `(workspace_id, provider)` guarantees only one connection per provider._

---

## API Endpoints

### Public Webhooks (Unauthenticated)

These are public endpoints exposed for webhook push triggers from Twilio and Telegram APIs.

| Method | Path                                    | Description                                             |
| ------ | --------------------------------------- | ------------------------------------------------------- |
| `POST` | `/integrations/whatsapp/twilio/webhook` | Receives incoming messages from Twilio WhatsApp numbers |
| `POST` | `/integrations/telegram/webhook`        | Receives updates/messages from the Telegram Bot API     |

### Admin Configuration (Authenticated)

Base path: `/v1/integrations`

| Method | Path                    | Role Required | Description                                           |
| ------ | ----------------------- | ------------- | ----------------------------------------------------- |
| `GET`  | `/`                     | Any Member    | List active integrations for the workspace            |
| `POST` | `/whatsapp/connect`     | Admin+        | Save Twilio WhatsApp settings and activate channel    |
| `POST` | `/telegram/connect`     | Admin+        | Link a Telegram chat ID manually and activate channel |
| `POST` | `/:provider/disconnect` | Admin+        | Deactivate and disconnect a messaging integration     |

---

## Business Logic

### Connection and Linking Flows

#### WhatsApp Connection

- Requires **Pro Plan** or higher (enforced via `WorkspacesService.assertPlanTier(workspaceId, 'Pro')`).
- Admin registers a phone number. Incoming webhook commands (`Connect Oewang <workspace-id>`) link the user's phone number directly to the workspace in the database.

#### Telegram Connection

- Users trigger connection via the bot chat with the start command (`/start <workspace-id>___<user-id>`).
- The bot extracts and validates the workspace slug and user ID, saving the `telegramChatId` to settings.

---

### Webhook Security & Signature Verification

To prevent spam and spoofing:

1. **Twilio Signature Verification**: The WhatsApp webhook checks the `x-twilio-signature` header against a computed SHA-1 HMAC of the request URL and raw form variables using the workspace `TWILIO_AUTH_TOKEN`.
2. **Telegram Webhook Secret**: Checks the incoming header `x-telegram-bot-api-secret-token` against `TELEGRAM_WEBHOOK_SECRET`.

If signature verification fails, the endpoints immediately reject the request with `403 Forbidden`.

---

### AI Receipt Extraction via Messaging

When a user sends an image/receipt file via WhatsApp or Telegram:

1. **Download Media**: The API fetches the file payload directly from the Telegram Bot API or Twilio Media CDN into buffer memory.
2. **Vault Upload**: The file is uploaded to the workspace's Cloudflare R2 bucket via `VaultService.uploadFile` and logged in `vault_files`.
3. **AI OCR Parsing**: The buffer is passed to `AiService.parseReceipt`. The AI model extracts the `amount`, `date`, `name`, and lists of individual item details.
4. **Transaction Logging**:
   - The system automatically creates a new transaction (`expense` type) using the default workspace wallet.
   - The Vault file ID is attached to the transaction record.
   - If individual items were successfully extracted, they are bulk-created as sub-items (`transaction_items`).
5. **Realtime User Confirmation**: Sends a confirmation message back (e.g. `✅ Added expense: Dinner for Rp150,000`).

---

### AI Conversational Assistant via Messaging

When a text message is received:

1. **Context Initialization**: Checks for a cached `chatSessionId` inside the integration settings. If missing, a new session is started.
2. **AI Reply**: Passes the user text to `AiService.chat`.
3. **Structured Commands**: If the AI responds with a JSON block draft transaction payload (e.g. `{ amount: 20000, name: 'Susu', walletId: 'wallet1', type: 'expense' }`), the system:
   - Executes the transaction creation tool natively on the server.
   - Converts the response text to a friendly confirmation (e.g., `✅ Sudah dicatat: Susu Rp20,000 dari dompet Kas.`).
4. **Reply Broadcast**: Sends the message back via `sendMessage` API.

---

## Source Files

| Layer         | File                                                       |
| ------------- | ---------------------------------------------------------- |
| Schema        | `packages/database/schema/workspace-integrations.ts`       |
| Controller    | `apps/api/modules/integrations/integrations.controller.ts` |
| Service       | `apps/api/modules/integrations/integrations.service.ts`    |
| Repository    | `apps/api/modules/integrations/integrations.repository.ts` |
| Security      | `apps/api/modules/integrations/webhook-security.ts`        |
| Security Test | `apps/api/modules/integrations/webhook-security.test.ts`   |
| AI Tooling    | `apps/api/modules/ai/ai.tools.ts`                          |

---

## Known Constraints & Edge Cases

- **WhatsApp Plan Lock**: Attempting to connect a WhatsApp integration for a workspace on the Starter plan returns a `422 UNPROCESSABLE_ENTITY` (assertPlanTier gate).
- **Twilio Sandbox limits**: Twilio sandbox WhatsApp endpoints require pre-registering the recipient's phone number in Twilio Console.
- **Asynchronous Webhook Processing**: Webhook routes immediately return a `200 OK` response to twilio/telegram servers to prevent webhook timeouts. Processing (downloading files, querying AI, updating DB, responding back) is performed in the background.
