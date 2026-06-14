# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Documentation:** [ARCHITECTURE.md](./docs/ARCHITECTURE.md) · [FEATURES.md](./docs/FEATURES.md) · [STYLE_GUIDE.md](./docs/STYLE_GUIDE.md) · [BEST_PRACTICE_ELYSIA.md](./docs/BEST_PRACTICE_ELYSIA.md) · [BEST_PRACTICE_NEXT_JS.md](./docs/BEST_PRACTICE_NEXT_JS.md) · [BEST_PRACTICE_FLUTTER.md](./docs/BEST_PRACTICE_FLUTTER.md) · [ENGINEERING_STANDARDS.md](./docs/ENGINEERING_STANDARDS.md) · [IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md) · [SHEET_GUIDE.md](./docs/SHEET_GUIDE.md) · [DATA_TABLE_PAGE_GUIDE.md](./docs/DATA_TABLE_PAGE_GUIDE.md)
> **References:** [REFERENCE_MIDDAY_AI.md](./docs/REFERENCE_MIDDAY_AI.md) — Midday AI chat, MCP server, and external app integration patterns
> **Testing:** [TESTING_UNIT.md](./docs/TESTING_UNIT.md) · [TESTING_E2E.md](./docs/TESTING_E2E.md)

---

## Commands

### Root (run from repo root)

```bash
bun run dev           # Start all apps in parallel via Turborepo
bun run build         # Build all apps
bun run lint          # Run Biome linting across all workspaces
bun run typecheck     # Type-check all workspaces
bun run format        # Prettier format (TS, TSX, MD)

# Database
bun run db:push       # Push schema changes (dev only — no migration files)
bun run db:seed       # Seed the database
bun run db:reset      # Reset + push + seed

# MCP server
bun run mcp           # Run the MCP server from apps/api/mcp.ts
```

### Per-app (run from app directory or via --cwd)

```bash
# apps/api
bun run dev           # ElysiaJS dev server with --watch
bun test              # Bun test runner

# apps/app
bun run dev           # Next.js dev (Turbopack)
bun run check:fix     # Biome check + autofix
bun run test:e2e      # Playwright E2E tests
bun run test:e2e:ui   # Playwright with UI mode
```

### Local infrastructure

```bash
docker compose up -d  # Start PostgreSQL 16 (5432) and Redis 7 (6379)
```

---

## Architecture

This is a **Turborepo monorepo** using **Bun** as package manager and runtime. See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full design.

### Apps

| App            | Framework              | Port | Purpose                         |
| -------------- | ---------------------- | ---- | ------------------------------- |
| `apps/app`     | Next.js 16 (Turbopack) | 3000 | Main SaaS application           |
| `apps/admin`   | Next.js                | 3001 | Admin dashboard                 |
| `apps/api`     | ElysiaJS (Bun)         | 3002 | REST API + MCP server           |
| `apps/website` | Next.js                | 3003 | Marketing website               |
| `apps/native`  | Flutter                | —    | Mobile app (Dart/Flutter 3.11+) |

### Key packages

- **`packages/database`** — Drizzle ORM + PostgreSQL. Schema lives here (33 tables); all DB access goes through this package. Primary keys use CUID2 (`@paralleldrive/cuid2`).
- **`packages/modules`** — Server actions and data-fetching logic. Next.js `app/` calls into these rather than hitting the API or DB directly.
- **`packages/ai`** — AI service abstractions over OpenAI, Anthropic Claude, and Google Generative AI. Includes agent, memory, artifact, and store tooling.
- **`packages/integrations`** — 40+ third-party integrations (Telegram, WhatsApp, Stripe, etc.).
- **`packages/ui`** — Shared React components built on shadcn + Radix UI + Tailwind CSS v4.
- **`packages/types`** — Central TypeScript type definitions and `ErrorCode` constants.
- **`packages/constants`** — Static constants: roles, colors, pricing features, API config.
- **`packages/encryption`** — AES-256-GCM encrypt/decrypt. Used in exactly two places: `apps/api/plugins/encryption.ts` and `apps/app/lib/axios.ts`.
- **`packages/redis`** — Redis client singleton. Uses ioredis (TCP) when `REDIS_URL` is set (local Docker), or Upstash REST when `UPSTASH_REDIS_REST_*` vars are set (production). Consumed by `apps/api/lib/cache.ts` and `apps/api/plugins/rate-limit.ts`.

### Data flow

```
Next.js pages/components
  → packages/modules (server actions)
    → packages/database (Drizzle queries)
      → PostgreSQL

Next.js pages/components
  → apps/api (ElysiaJS REST — AES-256-GCM encrypted transport)
    → packages/database / packages/integrations / packages/ai
```

**Auth flow** — custom JWT (HS256):

```
Login (email/password or OAuth provider)
  → apps/api generates oewang-session JWT (HS256)
  → apps/app sets httpOnly cookie on NextResponse
  → middleware verifies JWT cookie on every request
```

### Environment variables

All env vars are defined in a **single root `.env`** file and surfaced to workspaces via `turbo.json → globalEnv`. **Do not create `.env` files inside `apps/*` or `packages/*`.**

---

## Coding Standards

> Full details in [ENGINEERING_STANDARDS.md](./docs/ENGINEERING_STANDARDS.md)

### Naming

| Context                                  | Convention             |
| ---------------------------------------- | ---------------------- |
| Local variables, data objects, DB fields | `snake_case`           |
| React props and interface keys           | `camelCase`            |
| Files and directories                    | `kebab-case`           |
| React components                         | `PascalCase`           |
| Constants objects                        | `SCREAMING_SNAKE_CASE` |

### Typing

- Prefer `type` over `interface` for data models and state.
- Always add explicit return types to exported functions and API handlers.
- No `any` — use `unknown` or a concrete type. Use Zod at validation boundaries.
- TypeBox (`Elysia.t`) schemas are the single source of truth in `apps/api` — never duplicate with separate TypeScript interfaces.

### Logging

Always use `@workspace/logger` (Pino-based) in API and packages — **never `console.log`** in shared code.

```typescript
import { createLogger } from "@workspace/logger";
const log = createLogger("my-module");
log.info("Processing", { workspace_id, user_id });
```

### Linter

Biome (`@biomejs/biome`) handles both linting and formatting (2-space indent, 80-char line width). Run `bun run lint` or `biome check --write` before committing.

---

## ElysiaJS (apps/api)

> Full details in [BEST_PRACTICE_ELYSIA.md](./docs/BEST_PRACTICE_ELYSIA.md)

### Layer Flow

```
Request → authPlugin → rateLimitPlugin → Controller → Service → Repository → Database
```

### Critical Rules

1. **Always use method chaining** — breaking the chain loses Elysia type inference entirely.
2. **Controllers are Elysia instances** — not classes, not functions returning classes.
3. **Extract `workspace_id` from `auth` context only** — never from body or query params.
4. **Repositories are the only layer importing `@workspace/database`.**
5. **Every mutation calls `AuditLogsService.log()`** after success.
6. **Every read filters by `workspaceId` AND `isNull(deletedAt)`.**
7. **Soft delete only** — never `db.delete()`.

### Module Structure

```
modules/{feature}/
  {feature}.controller.ts   — Elysia instance (routes + validation)
  {feature}.service.ts      — abstract class with static methods
  {feature}.repository.ts   — DB queries only
  {feature}.dto.ts          — TypeBox schemas (or .model.ts)
  {feature}.utils.ts        — Pure helper functions
  {feature}.utils.test.ts   — Unit tests for utils
  __tests__/                — Service / repository / controller tests
```

---

## Next.js (apps/app)

> Full details in [BEST_PRACTICE_NEXT_JS.md](./docs/BEST_PRACTICE_NEXT_JS.md)

### Critical Rules

1. **`actions/` is the only place HTTP calls are made** — files must have `"use server"` and import `axiosInstance` from `@workspace/modules/server` (reads `oewang-session` httpOnly cookie from `next/headers`). Never use client axios in server actions.
2. **Never call `fetch` or `axios` directly** outside of `actions/`.
3. **All routes are dynamic by default** in Next.js 16 — opt into caching explicitly with `"use cache"`.
4. **Always `await params`** — it is a Promise in Next.js 16.
5. **Keep `"use client"` boundary as low as possible** in the component tree.
6. **Fetch independent data in parallel** with `Promise.all([...])`.
7. **All user-facing strings through the dictionary system** — no hardcoded strings.

### Route Structure

```
app/(main)/[locale]/
  (auth)/           — Public auth pages (login, register, invite, onboarding)
  (dashboard)/      — Authenticated app shell (all main features)
  invoice/[token]/  — Public shareable invoice
```

---

## Security

- Workspace context from `auth.workspace_id` in JWT — never from request body.
- All responses AES-256-GCM encrypted. `apps/app/lib/axios.ts` handles decryption.
- Rate limits: 300 req/min (authenticated) · 30 req/min (unauthenticated) · 10 req/15min (auth endpoints).
- Soft delete only — workspace-scoped records are never hard-deleted.
- **Never log:** passwords · JWT tokens · encryption keys · decrypted API payloads.

---

## Testing

| Guide                                     | Coverage                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [TESTING_UNIT.md](./docs/TESTING_UNIT.md) | Bun test runner, `bun:test` patterns, module mocking, utils test anatomy, service test with mocks, coverage requirements |
| [TESTING_E2E.md](./docs/TESTING_E2E.md)   | Playwright setup, fixture system, dictionary selectors, auth setup, spec file inventory, debugging                       |
| [TESTING.md](./TESTING.md)                | Full test inventory and metrics summary                                                                                  |

**Current baseline:** 399 unit tests (~134ms) · 115+ E2E tests

```bash
bun run test              # all unit tests
bun run test:watch        # watch mode
bun run test:coverage     # with coverage report
bun run test:e2e          # Playwright E2E (2–10 min)
bun run test:e2e:ui       # Playwright interactive UI mode
```

Test name format: `should {expected behaviour} when {condition}`

### 🤖 AI Agent Testing Obligations

When writing code, you MUST:

- **Add `.utils.test.ts`** whenever you create a `.utils.ts` file
- **Update `TESTING_UNIT.md` Test Inventory** when adding/removing test files
- **Add a spec file** in `apps/app/e2e/` when adding a new dashboard route
- **Update `TESTING_E2E.md` Spec Inventory** when adding/removing spec files
- **Update baseline counts** in `TESTING_UNIT.md`, `TESTING_E2E.md`, and `TESTING.md` if counts change significantly
