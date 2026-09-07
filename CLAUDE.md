# CLAUDE.md

Guidance for Claude Code working in this repo.

> **Docs:** [ARCHITECTURE.md](./docs/ARCHITECTURE.md) · [FEATURES.md](./docs/FEATURES.md) · [STYLE_GUIDE.md](./docs/STYLE_GUIDE.md) · [BEST_PRACTICE_ELYSIA.md](./docs/BEST_PRACTICE_ELYSIA.md) · [BEST_PRACTICE_NEXT_JS.md](./docs/BEST_PRACTICE_NEXT_JS.md) · [BEST_PRACTICE_FLUTTER.md](./docs/BEST_PRACTICE_FLUTTER.md) · [ENGINEERING_STANDARDS.md](./docs/ENGINEERING_STANDARDS.md) · [IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md) · [SHEET_GUIDE.md](./docs/SHEET_GUIDE.md) · [DATA_TABLE_PAGE_GUIDE.md](./docs/DATA_TABLE_PAGE_GUIDE.md) · [ENV_VARS.md](./docs/ENV_VARS.md)
> **Refs:** [REFERENCE_MIDDAY_AI.md](./docs/REFERENCE_MIDDAY_AI.md) — Midday AI chat / MCP / external-app patterns
> **Testing:** [TESTING_UNIT.md](./docs/TESTING_UNIT.md) · [TESTING_E2E.md](./docs/TESTING_E2E.md)

---

## Commands

```bash
# Root (Turborepo, all workspaces)
bun run dev / build / lint / typecheck / format
bun run db:push          # push schema (dev only, no migration files)
bun run db:seed / db:reset
bun run mcp              # MCP server (apps/api/mcp.ts)

# apps/api      bun run dev (--watch) · bun test
# apps/app      bun run dev (Turbopack) · bun run check:fix · bun run test:e2e[:ui]

docker compose up -d     # PostgreSQL 16 (5432) + Redis 7 (6379)
```

---

## Architecture

**Turborepo monorepo**, Bun as package manager + runtime. Full design in [ARCHITECTURE.md](./docs/ARCHITECTURE.md).

| App            | Framework              | Port | Purpose                         |
| -------------- | ---------------------- | ---- | ------------------------------- |
| `apps/app`     | Next.js 16 (Turbopack) | 3000 | Main SaaS app                   |
| `apps/admin`   | Next.js                | 3001 | Admin dashboard                 |
| `apps/api`     | ElysiaJS (Bun)         | 3002 | REST API + MCP server           |
| `apps/website` | Next.js                | 3003 | Marketing website               |
| `apps/ai`      | FastAPI (Python 3.12)  | 3004 | All AI logic (see below)        |
| `apps/worker`  | Go (asynq)             | 8080 | Background jobs (see below)     |
| `apps/native`  | Flutter                | —    | Mobile app (Dart/Flutter 3.11+) |

### Key packages

- **`packages/database`** — Drizzle + PostgreSQL. Schema + all DB access. PKs use CUID2. Repositories are the only layer importing this.
- **`packages/modules`** — Server actions / data-fetching. Next.js `app/` calls these, not the API or DB directly.
- **`packages/integrations`** — 40+ third-party integrations (Telegram, Stripe, …).
- **`packages/ui`** — shadcn + Radix + Tailwind v4 components.
- **`packages/types`** — types + `ErrorCode` constants. **`packages/constants`** — roles, colors, pricing, API config.
- **`packages/encryption`** — AES-256-GCM. Used only in `apps/api/plugins/encryption.ts` + `apps/app/lib/axios.ts`.
- **`packages/redis`** — Redis singleton (ioredis, TCP via `REDIS_URL`). Used by `apps/api/lib/cache.ts` + `plugins/rate-limit.ts`.

**AI logic lives in `apps/ai` (Python)** — chat orchestration, tool execution (DB writes/audit/quota), receipt OCR, CSV import, RAG, chunking, canvas tools, **and** (as of the chatBegin/chatEnd migration) the web chat money path: JWT auth, session mgmt, the receipt-draft short-circuit, quota enforcement, and system-prompt build all run in-process against Postgres (`apps/ai/app/modules/chatbot/{chat_money_path,draft}.py`, `app/core/{auth,quota,sessions,vault}.py`). The old `packages/ai` was removed. Website chat calls `apps/ai` directly (no TS round-trip per turn); `apps/api` keeps the sidecar client (`ai-sidecar-client.ts`, HTTP + `x-api-key`, requires `AI_SERVICE_URL`, no in-process fallback) and a couple of standalone reads (`GET /ai/sessions*`, `GET /ai/quota`, `POST /ai/parse-receipt`).

**Background jobs live in `apps/worker` (Go/asynq)** — Telegram webhook processing and CSV/bank-statement transaction import are owned end-to-end by the worker: it calls `apps/ai`'s internal endpoints (`/draft/*`, `/tools/execute`, `/import/extract`, `/chat/stream`) and Postgres directly, with no TS round-trip (`apps/worker/internal/tasks/{webhook_telegram,transactions_import}.go`). apps/api's `IntegrationsService.handleTelegramWebhook` and `chatViaSidecarStream` were removed — the worker is now the sole Telegram-message handler. Billing lifecycle, vault storage sweeps, invoice-overdue detection, and AI quota reset/anomaly-scan still delegate business logic back to `apps/api`'s `/v1/internal/*` or `apps/ai`'s `/internal/*` endpoints — the worker only owns their scheduling/retry. apps/api enqueues onto the worker via `apps/api/modules/worker/worker-client.ts` (HTTP + `x-api-key`, mirrors `ai-sidecar-client.ts`'s shape) and creates the `transaction_import_jobs` row the worker reports completion status back into.

### Data flow

- **DB path:** pages → `packages/modules` server actions → `packages/database` (Drizzle) → PostgreSQL.
- **API path:** pages → `apps/api` (ElysiaJS, AES-256-GCM transport) → database / integrations.
- **AI path:** `apps/ai` (FastAPI) runs the LLM loop and the full chat money path, both writing to PostgreSQL directly (incl. audit + quota). Web chat verifies the user's `oewang-session` JWT itself (PyJWT, HS256, `JWT_SECRET` shared with the TS apps); Telegram and other service-to-service calls use `x-api-key` only, with `workspace_id`/`user_id` explicit in the body.
- **Worker path:** `apps/api` enqueues onto `apps/worker` (Go/asynq, `x-api-key`) for Telegram webhook processing and transaction import; the worker calls `apps/ai` and PostgreSQL directly for those two flows, and calls back into `apps/api`'s `/v1/internal/*` for everything else (billing/vault/invoice sweeps).
- **Auth:** login → `apps/api` issues `oewang-session` JWT (HS256) → `apps/app` sets httpOnly cookie → middleware verifies on every request.

### Env vars

All in a **single root `.env`**, surfaced via `turbo.json → globalEnv`. **Never** create `.env` inside `apps/*` or `packages/*` — the sole exception is `apps/native/.env` (Flutter bundles it as an asset, it can't read the root file at runtime). See [ENV_VARS.md](./docs/ENV_VARS.md) for which vars each resource actually needs.

---

## Coding Standards

Full details in [ENGINEERING_STANDARDS.md](./docs/ENGINEERING_STANDARDS.md).

| Context                                  | Convention             |
| ---------------------------------------- | ---------------------- |
| Local vars, data objects, DB fields      | `snake_case`           |
| React props / interface keys             | `camelCase`            |
| Files and directories                    | `kebab-case`           |
| React components                         | `PascalCase`           |
| Constants objects                        | `SCREAMING_SNAKE_CASE` |

- Prefer `type` over `interface` for data models/state. Explicit return types on exported functions + API handlers.
- No `any` — use `unknown` or a concrete type. Zod at validation boundaries.
- TypeBox (`Elysia.t`) schemas are the single source of truth in `apps/api` — never duplicate with TS interfaces.
- Logging: always `@workspace/logger` (Pino) in API + packages — **never `console.log`** in shared code.
- Lint/format: Biome (2-space, 80-char). Run `bun run lint` / `biome check --write` before committing.

---

## ElysiaJS (apps/api)

Full details in [BEST_PRACTICE_ELYSIA.md](./docs/BEST_PRACTICE_ELYSIA.md). Layer flow: `authPlugin → rateLimitPlugin → Controller → Service → Repository → Database`.

### Critical Rules

1. **Always method-chain** — breaking the chain loses Elysia type inference entirely.
2. **Controllers are Elysia instances** — not classes.
3. **Extract `workspace_id` from `auth` context only** — never from body/query.
4. **Repositories are the only layer importing `@workspace/database`.**
5. **Every mutation calls `AuditLogsService.log()`** after success.
6. **Every read filters by `workspaceId` AND `isNull(deletedAt)`.**
7. **Soft delete only** — never `db.delete()`.

Module layout: `modules/{feature}/` with `.controller.ts` (routes+validation) · `.service.ts` (abstract class, static methods) · `.repository.ts` (DB only) · `.dto.ts`/`.model.ts` (TypeBox) · `.utils.ts` + `.utils.test.ts` · `__tests__/`.

---

## Next.js (apps/app)

Full details in [BEST_PRACTICE_NEXT_JS.md](./docs/BEST_PRACTICE_NEXT_JS.md).

### Critical Rules

1. **`actions/` is the only place HTTP calls are made** — `"use server"`, import `axiosInstance` from `@workspace/modules/server` (reads `oewang-session` cookie). Never client axios in server actions.
2. **Never call `fetch`/`axios` directly** outside `actions/`.
3. **Routes dynamic by default** (Next.js 16) — opt into caching with `"use cache"`.
4. **Always `await params`** — it is a Promise in Next.js 16.
5. **Keep `"use client"` boundary as low as possible.**
6. **Fetch independent data in parallel** with `Promise.all([...])`.
7. **All user-facing strings through the dictionary system** — no hardcoded strings.

Routes: `app/(main)/[locale]/` → `(auth)/` public auth · `(dashboard)/` authed shell · `invoice/[token]/` public invoice.

---

## Security

- Workspace context from `auth.workspace_id` in JWT — never from request body.
- All responses AES-256-GCM encrypted; `apps/app/lib/axios.ts` decrypts.
- Rate limits: 300 req/min (auth) · 30 req/min (unauth) · 10 req/15min (auth endpoints).
- Soft delete only — workspace-scoped records never hard-deleted.
- **Never log:** passwords · JWT tokens · encryption keys · decrypted API payloads.

---

## Testing

Guides: [TESTING_UNIT.md](./docs/TESTING_UNIT.md) (Bun runner, mocking, utils/service tests) · [TESTING_E2E.md](./docs/TESTING_E2E.md) (Playwright, fixtures, dictionary selectors) · [TESTING.md](./TESTING.md) (full inventory).

**Baseline:** 413 unit tests (~200ms) · 115+ E2E. Recall aggregation is in the Python sidecar; `apps/ai` has its own `pytest` suite; `apps/worker` has its own `go test` suite (see [TESTING_UNIT.md](./docs/TESTING_UNIT.md)'s apps/worker section). Test name format: `should {behaviour} when {condition}`.

### 🤖 AI Agent Testing Obligations

When writing code, you MUST:

- **Add `.utils.test.ts`** whenever you create a `.utils.ts` file.
- **Update `TESTING_UNIT.md` Test Inventory** when adding/removing test files.
- **Add a spec file** in `apps/app/e2e/` when adding a new dashboard route.
- **Update `TESTING_E2E.md` Spec Inventory** when adding/removing spec files.
- **Update baseline counts** in `TESTING_UNIT.md`, `TESTING_E2E.md`, `TESTING.md` if counts change significantly.
