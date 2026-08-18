# CLAUDE.md

Guidance for Claude Code working in this repo.

> **Docs:** [ARCHITECTURE.md](./docs/ARCHITECTURE.md) · [FEATURES.md](./docs/FEATURES.md) · [STYLE_GUIDE.md](./docs/STYLE_GUIDE.md) · [BEST_PRACTICE_ELYSIA.md](./docs/BEST_PRACTICE_ELYSIA.md) · [BEST_PRACTICE_NEXT_JS.md](./docs/BEST_PRACTICE_NEXT_JS.md) · [BEST_PRACTICE_FLUTTER.md](./docs/BEST_PRACTICE_FLUTTER.md) · [ENGINEERING_STANDARDS.md](./docs/ENGINEERING_STANDARDS.md) · [IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md) · [SHEET_GUIDE.md](./docs/SHEET_GUIDE.md) · [DATA_TABLE_PAGE_GUIDE.md](./docs/DATA_TABLE_PAGE_GUIDE.md)
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
| `apps/native`  | Flutter                | —    | Mobile app (Dart/Flutter 3.11+) |

### Key packages

- **`packages/database`** — Drizzle + PostgreSQL. Schema + all DB access. PKs use CUID2. Repositories are the only layer importing this.
- **`packages/modules`** — Server actions / data-fetching. Next.js `app/` calls these, not the API or DB directly.
- **`packages/integrations`** — 40+ third-party integrations (Telegram, WhatsApp, Stripe, …).
- **`packages/ui`** — shadcn + Radix + Tailwind v4 components.
- **`packages/types`** — types + `ErrorCode` constants. **`packages/constants`** — roles, colors, pricing, API config.
- **`packages/encryption`** — AES-256-GCM. Used only in `apps/api/plugins/encryption.ts` + `apps/app/lib/axios.ts`.
- **`packages/redis`** — Redis singleton (ioredis TCP local / Upstash REST prod). Used by `apps/api/lib/cache.ts` + `plugins/rate-limit.ts`.

**AI logic lives in `apps/ai` (Python)** — chat orchestration, tool execution (DB writes/audit/quota), receipt OCR, CSV import, RAG, chunking, canvas tools. The old `packages/ai` was removed. `apps/api` reaches it via `apps/api/modules/ai/ai-sidecar-client.ts` (HTTP, `x-api-key`); requires `AI_SERVICE_URL`, no in-process fallback. Website chat calls `apps/ai` directly; `apps/api` keeps only identity/session/quota plumbing.

### Data flow

- **DB path:** pages → `packages/modules` server actions → `packages/database` (Drizzle) → PostgreSQL.
- **API path:** pages → `apps/api` (ElysiaJS, AES-256-GCM transport) → database / integrations.
- **AI path:** `apps/ai` (FastAPI, `x-api-key`) runs the LLM loop + writes to PostgreSQL (incl. audit + quota) directly.
- **Auth:** login → `apps/api` issues `oewang-session` JWT (HS256) → `apps/app` sets httpOnly cookie → middleware verifies on every request.

### Env vars

All in a **single root `.env`**, surfaced via `turbo.json → globalEnv`. **Never** create `.env` inside `apps/*` or `packages/*`.

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

**Baseline:** 401 unit tests (~134ms) · 115+ E2E. Recall aggregation is in the Python sidecar; `apps/ai` has its own `pytest` suite. Test name format: `should {behaviour} when {condition}`.

### 🤖 AI Agent Testing Obligations

When writing code, you MUST:

- **Add `.utils.test.ts`** whenever you create a `.utils.ts` file.
- **Update `TESTING_UNIT.md` Test Inventory** when adding/removing test files.
- **Add a spec file** in `apps/app/e2e/` when adding a new dashboard route.
- **Update `TESTING_E2E.md` Spec Inventory** when adding/removing spec files.
- **Update baseline counts** in `TESTING_UNIT.md`, `TESTING_E2E.md`, `TESTING.md` if counts change significantly.
