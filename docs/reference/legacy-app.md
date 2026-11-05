# Legacy App Reference

Status: draft v0.1, 2026-11-02. Part of the [oewang docs](../README.md). Describes `references/oewang-old`, read-only.

Where the rewrite comes from. Read this when porting a screen, checking a business rule, or deciding whether something was dropped on purpose.

## Update this doc when

- A port reveals that the old behaviour differs from what is recorded here.
- The reference copy is updated or moved.

## What it is

A Turborepo monorepo, Bun as package manager and runtime, version 2.2.0 at the time of the snapshot. Seven apps, seventeen packages, 42 database tables, 34 documentation files.

### Apps

| App | Stack | Port | Rewrite |
|---|---|---|---|
| `apps/app` | Next.js 16, React 19, Turbopack | 3000 | Replaced by `apps/app` (SvelteKit). Three screens ported |
| `apps/admin` | Next.js | 3001 | Dropped |
| `apps/api` | ElysiaJS on Bun | 3002 | Replaced by `apps/api` (Rust Axum) |
| `apps/website` | Next.js | 3003 | Dropped |
| `apps/ai` | FastAPI, Python 3.12 | 3004 | Replaced by `apps/ai`, much smaller |
| `apps/worker` | Go, asynq | 3005 | Dropped. One job moved into the API as a tokio task (D10) |
| `apps/native` | Flutter | n/a | Dropped |

### Packages

`bucket`, `constants`, `currencyfreaks`, `database`, `dictionaries`, `email`, `encryption`, `eslint-config`, `integrations`, `logger`, `modules`, `playwright`, `redis`, `types`, `typescript-config`, `ui`, `utils`.

None survive. The rewrite has no shared package layer: the three apps speak HTTP (D18).

## What the rewrite takes

| Taken | From | Where it lives now |
|---|---|---|
| The transaction and chat schema | `packages/database/schema/` | [data model](../data-model.md) |
| The tuned partial indexes | the same | [data model](../data-model.md#tables-in-scope) |
| Balance arithmetic | `apps/api/modules/transactions/transactions.service.ts` | [balance arithmetic](../data-model.md#balance-arithmetic) |
| The layer discipline (controller, service, repository) | `apps/api/modules/*` | [Rust best practices](../best-practices/rust-api.md#layer-flow) |
| Soft delete and audit logging | the same | OPS-1, OPS-2 |
| Screen layouts and interaction models | `apps/app/components/organisms/` | the port maps in [transactions](../features/transactions.md#ui-port-map), [accounts](../features/accounts.md#ui-port-map) and [chat](../features/chat.md#ui-port-map) |
| Design tokens, colours, radii, dark mode | `packages/ui/globals.css` | US-006 |
| The multi-workspace role model | `packages/database/schema/user-workspaces.ts` | [auth](../security/auth.md#roles) |
| The idea of a tool-calling assistant | `apps/ai/app/modules/chatbot/` | [AI service](../ai/service.md), 11 tools instead of 34 |

## What the rewrite drops, and why

| Dropped | Why |
|---|---|
| Invoices, debts, budgets, contacts | Out of scope ([PRD non-goals](../prd.md#non-goals-for-v1)) |
| Vault as a feature, document RAG, `ai_knowledge_chunks` | Only attachment storage is needed |
| Billing: Mayar, plans, addons, AI token quota, storage limits | Out of scope |
| Integrations, Telegram webhook handling | Telegram rebuilt, not ported (D83 to D86): linking by one-time token instead of `/start <slug>___<user>`, long polling from the API instead of a webhook into the Go worker, receipts saved on arrival. Every other integration is out of scope |
| The MCP server and its OAuth 2.1 client registration | Out of scope |
| OAuth login providers | D21 |
| Notifications, push, device tokens, realtime invalidation | Out of scope |
| Anomaly detection, transaction classification, the advisor endpoint | Out of scope. The advisor had no caller even in the old app |
| Canvas artifacts and chat charts | Spending, income and burn rate came back with D88, built by the API rather than by the AI service, and stored on the tool call. Debt and budget canvases stay out with their features |
| Three locales (`en`, `id`, `ja`) | English only, through a dictionary (D15) |
| The Go worker | D10 |
| Direct Postgres writes from Python and Go | D3, D4. The single most important structural change |
| The old AES-256-GCM transport layer | Replaced, not removed: a static shared key became a per-session handshake (D22, [payload encryption](../api/encryption.md)) |
| `ai_agent_settings.model`, `.temperature`, `.max_steps` | Stored and exposed, never read by the loop |

## Schema mapping

Old schema at `references/oewang-old/packages/database/schema/`. Sixteen of the 42 tables carry over ([tables in scope](../data-model.md#tables-in-scope)).

| Old file | Rewrite |
|---|---|
| `users.ts` | Kept, trimmed: no OAuth columns, no `system_role` |
| `workspaces.ts` | Kept, heavily trimmed: no billing, quota or storage columns; `currency_code` added |
| `user-workspaces.ts`, `workspace-invitations.ts` | Kept as is |
| `wallets.ts`, `wallet-groups.ts`, `categories.ts` | Kept as is, plus a partial unique index for the default wallet |
| `transactions.ts`, `transaction-items.ts`, `transaction-attachments.ts` | Kept as is |
| `transaction-import-jobs.ts` | Kept; driven by a tokio task instead of the Go worker |
| `vault-files.ts` | Kept, trimmed; `sha256` and `status` added for chunked upload |
| `ai-sessions.ts`, `ai-messages.ts` | Kept as is |
| `ai-agent-settings.ts` | Kept, down to two useful columns |
| `audit-logs.ts` | Kept, plus a `source` column |
| The other 26 files | Dropped |

## Known problems in the old implementation

Recorded so the rewrite does not reproduce them.

| Problem | Where | Fixed by |
|---|---|---|
| Three processes wrote to Postgres; workspace scoping, balance arithmetic and audit logging existed twice, in two languages, and had drifted | `apps/api`, `apps/ai`, `apps/worker` | D3, D4 |
| Wallet balance updates took no row lock. Two concurrent edits to one wallet could interleave | `transactions.service.ts` | D13, TXN-6 |
| The audit row was written after the commit, so a failed commit could leave a log of something that never happened | `AuditLogsService.log()` | D14, OPS-1 |
| Payload encryption used one static shared key held by both ends. No forward secrecy, no replay protection, no binding to the request | `packages/encryption` | D22, [payload encryption](../api/encryption.md) |
| `ai_agent_settings` exposed model, temperature and max steps in the UI; the loop read none of them | `apps/ai` | Columns removed |
| 34 chat tools, most for features the product is not about | `apps/ai/app/modules/chatbot/tools.py` | D17, eleven tools |
| Receipt and statement extraction shared the tool-capable path, so attacker-controlled text reached a model holding write tools | `apps/ai` | D24, [AI safety](../security/ai-safety.md) |
| Two chat paths existed, `/chat/stream` (no tool loop, legacy) and `/internal/chat/stream` (tool loop); the docs warned never to use the first for Telegram | `apps/ai/app/api/routes/chatbot.py` | One path |
| Components grew past 900 lines by accumulating out-of-scope concerns | `transaction-form-sheet.tsx` | Port targets roughly half the line count |

## Where to look when porting

| Need | Path under `references/oewang-old/` |
|---|---|
| Transaction screens | `apps/app/components/organisms/transactions/` |
| Account screens | `apps/app/components/organisms/accounts/` |
| Chat screens | `apps/app/components/organisms/chat/` |
| Design tokens | `packages/ui/globals.css` |
| Shared primitives | `packages/ui/components/` |
| Transaction business rules | `apps/api/modules/transactions/` |
| Schema | `packages/database/schema/` |
| Feature documentation | `docs/FEAT_TRANSACTIONS.md`, `docs/FEAT_AI.md` |
| Architecture and standards | `docs/ARCHITECTURE.md`, `docs/ENGINEERING_STANDARDS.md` |
| Prompt and tools | `apps/ai/app/modules/chatbot/prompts_web.py`, `tools.py` |
| English strings | `packages/dictionaries/en.json` |

The old `CLAUDE.md` and `AGENTS.md` describe the old architecture. They are accurate about that system and misleading about this one. Read them as history.

## Related docs

- [Docs index](../README.md) and [PRD](../prd.md)
- [Architecture decision log](../architecture.md#decision-log)
- [Data model](../data-model.md)
- [Transactions](../features/transactions.md) and [chat](../features/chat.md)
- [Payload encryption](../api/encryption.md) and [AI safety](../security/ai-safety.md)
