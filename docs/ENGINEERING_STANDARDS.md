# Engineering Standards

> See also: [CLAUDE.md](../CLAUDE.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [BEST_PRACTICE_ELYSIA.md](./BEST_PRACTICE_ELYSIA.md) · [BEST_PRACTICE_NEXT_JS.md](./BEST_PRACTICE_NEXT_JS.md)

This document defines the **non-negotiable coding standards** for oewang. Every code change must comply. These standards exist to maintain consistency, type safety, security, and testability across the monorepo.

---

## Naming Conventions

| Context                                  | Convention                           | Example                                   |
| ---------------------------------------- | ------------------------------------ | ----------------------------------------- |
| Local variables, data objects, DB fields | `snake_case`                         | `workspace_id`, `created_at`, `user_id`   |
| React props and interface/type keys      | `camelCase`                          | `workspaceId`, `createdAt`, `userId`      |
| Files and directories                    | `kebab-case`                         | `wallet-groups.ts`, `audit-logs/`         |
| React components                         | `PascalCase`                         | `TransactionList`, `WalletCard`           |
| TypeScript types and interfaces          | `PascalCase`                         | `WorkspaceRole`, `ApiResponse<T>`         |
| Constants objects                        | `SCREAMING_SNAKE_CASE`               | `ErrorCode`, `ROLES`, `SYSTEM_ROLES`      |
| Elysia controller exports                | `camelCase`                          | `walletsController`, `authController`     |
| Test names                               | `should {behavior} when {condition}` | `should return 404 when wallet not found` |

> **Note on DB columns:** The database schema uses `camelCase` column names (e.g., `workspaceId`, `createdAt`) via Drizzle ORM's mapping, while the underlying PostgreSQL columns follow `snake_case`. When writing Drizzle queries, always use the camelCase property names from the schema definitions.

---

## TypeScript Standards

### Prefer `type` over `interface`

```ts
// ✅ CORRECT
type WalletGroup = {
  id: string;
  workspaceId: string;
  name: string;
};

// ✅ Also correct for complex cases
interface Repository<T> {
  findById(id: string): Promise<T | null>;
}

// ❌ AVOID for simple data shapes
interface WalletGroup {
  id: string;
  workspaceId: string;
}
```

### No `any`

```ts
// ✅ Use `unknown` or a concrete type
function parseResponse(data: unknown): ApiResponse<Wallet> { ... }

// ✅ Use explicit generics
async function findMany<T>(query: string): Promise<T[]> { ... }

// ❌ FORBIDDEN
const data: any = response.json();
```

Exceptions: Drizzle ORM occasionally requires `any` for complex SQL expressions (e.g., `updateData: any = {}`). Document these with a comment.

### Explicit Return Types on Exports

```ts
// ✅ CORRECT — explicit return types
export async function getWallets(workspaceId: string): Promise<ApiResponse<Wallet[]>> { ... }
export const walletsController = new Elysia() // Elysia infers its own return type

// ❌ AVOID — missing return type on exported function
export async function getWallets(workspaceId: string) { ... }
```

### TypeBox as Single Source of Truth

Never declare a separate TypeScript interface/type alongside a TypeBox schema — they diverge.

```ts
// ✅ CORRECT — infer type from schema
import { t, type Static } from "elysia";

const CreateWalletBody = t.Object({
  name: t.String({ minLength: 1 }),
  balance: t.Optional(t.String()),
});

type CreateWalletInput = Static<typeof CreateWalletBody>;
// use CreateWalletInput throughout service and repository

// ❌ FORBIDDEN — duplicate type declaration
interface CreateWalletInput {
  name: string;
  balance?: string;
}
```

### Zod at Validation Boundaries

Use Zod for external data validation (env vars, external webhooks, form data outside Elysia):

```ts
// apps/api/config/env.ts — validates all env vars at startup
import { z } from "zod";
const schema = z.object({ JWT_SECRET: z.string().min(32) });
```

---

## Logging

Always use `@workspace/logger` (Pino-based) in `apps/api` and packages. **Never use `console.log`** in shared or API code.

```ts
import { createLogger } from "@workspace/logger";
const log = createLogger("wallets");

// ✅ Structured logging with context
log.info("Wallet created", { workspace_id, wallet_id: wallet.id });
log.error("Failed to process payment", { error: err.message, workspace_id });

// ❌ FORBIDDEN in api/packages
console.log("Wallet created:", wallet);
```

`apps/app` uses Sentry (not `@workspace/logger`) for error tracking. `console.*` calls in `apps/app` are stripped in production by the Next.js compiler.

**Never log:** passwords · JWT tokens · encryption keys · decrypted API payloads

Always include `workspace_id` and `user_id` in error/warn log context for traceability.

---

## Linting & Formatting

**Biome** (`@biomejs/biome`) is the single tool for both linting and formatting:

- **2-space indent**
- **80-character line width**
- Config: `biome.json` at repo root

```bash
bun run lint          # check all workspaces
bun run format        # format TS, TSX, MD files
bun run check:fix     # Biome check + autofix (from apps/app)
```

Run before every commit. The CI pipeline blocks merges with lint violations.

---

## Environment Variables

Env vars are split across per-service Railway files and a local root `.env`. **Never create `.env` files inside `apps/*` or `packages/*`.**

### File Structure

| File | Git | Purpose |
| ----------------------- | --- | ----------------------------------------------- |
| `.env` | ❌ | Local development — all services combined |
| `.env.global` | ❌ | Railway Shared Variables (contains real secrets) |
| `.env.global.example` | ✅ | Safe template — keys only, no real values |
| `.env.api` | ✅ | Railway `api` service — Railway `${{ref}}` only |
| `.env.app` | ✅ | Railway `app` service — Railway `${{ref}}` only |
| `.env.admin` | ✅ | Railway `admin` service — Railway `${{ref}}` only |
| `.env.website` | ✅ | Railway `website` service — Railway `${{ref}}` only |

Railway own-domain rule: each service uses `${{RAILWAY_PUBLIC_DOMAIN}}` (no prefix) for its own URL. Other services use `${{servicename.RAILWAY_PUBLIC_DOMAIN}}`.

### Zod Validation

Every app validates its env at startup. The API **refuses to start** with missing required vars.

| Schema file | Validates |
| ------------------------------- | ----------------------------------- |
| `apps/api/config/env.ts` | API service vars |
| `apps/app/env.ts` | App service vars |
| `packages/constants/src/env.ts` | Shared vars used across packages |

### Key Variables

```bash
# Required everywhere
JWT_SECRET=                 # ≥32 chars — openssl rand -hex 32
ENCRYPTION_KEY=             # exactly 32 chars — openssl rand -hex 16
DATABASE_URL=               # PostgreSQL connection string

# Required in production
MAYAR_API_KEY=
MAYAR_WEBHOOK_TOKEN=

# Integrations
EVOLUTION_API_URL=          # WhatsApp via Evolution API
EVOLUTION_API_TOKEN=
EVOLUTION_API_INSTANCE=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=    # openssl rand -hex 32

# OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Storage (S3-compatible)
BUCKET_ENDPOINT=
BUCKET_ACCESS_KEY_ID=
BUCKET_SECRET_ACCESS_KEY=
BUCKET_NAME=

# NEXT_PUBLIC_ vars are bundled into the browser — NEVER put secrets here
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_SESSION_COOKIE_NAME=oewang-session
```

### Mandatory Checklist When Changing Env Vars

When **adding**, **removing**, or **renaming** any environment variable:

- [ ] `apps/api/config/env.ts` — update Zod schema
- [ ] `apps/app/env.ts` — update Zod schema (if used in app)
- [ ] `packages/constants/src/env.ts` — update shared schema (if used across packages)
- [ ] `.env` — add var with local placeholder/default
- [ ] `.env.global.example` — add var with empty value + description comment
- [ ] `.env.global` — add var with real value
- [ ] `.env.api` / `.env.app` / `.env.admin` / `.env.website` — add to affected services
- [ ] `turbo.json → globalEnv` — add if Turborepo needs to surface it

---

## Security Rules

### Authentication

- `workspace_id` and `user_id` sourced from `auth` context (set by `authPlugin`) — **never from request body or query params**
- Passwords hashed with bcrypt, minimum cost factor 12
- JWT payload: `{ user_id, workspace_id, email, system_role, iat, exp }` — no sensitive data beyond this
- Failed auth rate-limited: 10 req/15min per IP on auth endpoints (`/v1/auth/*`)

### Workspace Isolation (CRITICAL)

Every repository query MUST filter by `workspace_id` AND `isNull(deleted_at)`:

```ts
// MANDATORY on every read:
.where(and(
  eq(table.workspaceId, workspaceId),
  isNull(table.deletedAt),
))
```

No cross-workspace joins. No global queries without explicit super-admin role check.

### Soft Delete Only

```ts
// ✅ Soft delete
await db
  .update(wallets)
  .set({ deletedAt: new Date().toISOString() })
  .where(and(eq(wallets.id, id), eq(wallets.workspaceId, workspaceId)));

// ❌ FORBIDDEN — hard delete
await db.delete(wallets).where(eq(wallets.id, id));
```

### Input Validation

All incoming data validated with TypeBox in the controller before the service layer:

- Invalid input → `400` + `ErrorCode.VALIDATION_ERROR` — never reaches service
- Sanitize strings: trim whitespace, normalize currency codes to uppercase
- File uploads: validate MIME type and file size server-side before storing to bucket

---

## Testing Standards

### Test Location

Tests co-located inside `__tests__/` within each module:

```
modules/wallets/
  wallets.utils.ts
  wallets.utils.test.ts     — unit tests for pure utils (no DB needed)
  __tests__/
    wallets.service.test.ts — unit tests (repository mocked)
    wallets.controller.test.ts — integration tests (HTTP)
    mocks/
      wallets.repository.mock.ts
```

### Test Name Format

```
should {expected behaviour} when {condition}
```

Examples:

- `should return 404 when wallet does not exist`
- `should throw 403 when user is not a workspace member`
- `should not return soft-deleted wallets`

### Coverage Requirements

| Layer               | Test Type                  | Minimum                             |
| ------------------- | -------------------------- | ----------------------------------- |
| Utils (`.utils.ts`) | Unit                       | ≥ 90% branch                        |
| Service             | Unit (repository mocked)   | ≥ 80% branch                        |
| Repository          | Integration (real test DB) | ≥ 1 happy + 1 error path per method |
| Controller          | Integration (HTTP)         | All status codes + input validation |

### Running Tests

```bash
# From repo root
bun run test              # all API unit tests (~134ms)
bun run test:watch        # watch mode
bun run test:coverage     # with coverage report

# From apps/api
bun test modules/wallets  # single module
bun test --watch          # watch mode

# E2E
bun run test:e2e          # Playwright (2-10 min)
bun run test:e2e:ui       # Playwright with UI mode
```

Current test baseline: **399 unit tests** across 12 modules + **115+ E2E tests**. All must pass before merging.

---

## Git Branching

| Branch           | Usage                                               |
| ---------------- | --------------------------------------------------- |
| `main`           | Production — **never commit directly**              |
| `dev`            | Development integration — **never commit directly** |
| `feature/{name}` | New features                                        |
| `fix/{name}`     | Bug fixes                                           |
| `chore/{name}`   | Maintenance, dependency updates                     |

- Open a PR for every change
- Check for open PRs on the same module before starting work
- PRs must pass CI checklist before merge

---

## CI Checklist

Every PR must pass all four before merge:

```bash
bun run typecheck    # zero TypeScript errors
bun run lint         # zero Biome violations
bun run test         # 399+ unit tests pass, coverage thresholds met
bun run build        # clean production build (apps/app + apps/api)

# If schema changed — also run:
bun run --cwd packages/database drizzle-kit generate
bun run --cwd packages/database drizzle-kit migrate
bun run build        # re-verify after migration
```

---

## Database Migration Workflow

**Mandatory order — never skip a step:**

```bash
# 1. Edit schema file(s) in packages/database/schema/
# 2. Generate migration SQL
bun run --cwd packages/database drizzle-kit generate

# 3. Review generated SQL in packages/database/drizzle/
#    (read-only — NEVER edit migration files manually)

# 4. Apply migration to database
bun run --cwd packages/database drizzle-kit migrate

# 5. Re-run typecheck + build to verify
bun run typecheck && bun run build
```

**Never:** manually edit files in `packages/database/drizzle/`.
**Never:** use `db:push` (schema push) in production — always generate proper migration files.

---

## Audit Logging

Every successful mutation MUST produce an audit log entry:

```ts
await AuditLogsService.log({
  workspace_id: workspaceId,
  user_id: userId,
  action: "wallet.created", // format: "entity.verb"
  entity: "wallet",
  entity_id: wallet.id,
  before: null, // null for creates
  after: wallet, // null for deletes
});
```

The `before`/`after` fields must exclude passwords and tokens.

---

## Realtime Notifications

After data mutations, notify workspace subscribers:

```ts
// After every create/update/delete in a service:
RealtimeService.notifyValueChange(workspaceId, "wallets");
// Supported types: "wallets", "transactions", "categories", etc.
```

This triggers WebSocket events to all clients subscribed to the workspace channel.

---

## Observability

| Signal          | Tool                       | Where                                                     |
| --------------- | -------------------------- | --------------------------------------------------------- |
| Errors (server) | Sentry                     | `apps/api/instrument.ts` (first import in index.ts)       |
| Errors (client) | Sentry                     | `apps/app/instrumentation.ts` + `sentry.client.config.ts` |
| Structured logs | `@workspace/logger` (Pino) | All `apps/api` and packages                               |
| Request logs    | `loggerPlugin`             | `apps/api/plugins/logger.ts`                              |

**Never attach to Sentry events:** passwords · decrypted payloads · JWT tokens · encryption keys

Always set `Sentry.setUser({ id: userId })` for authenticated requests — no raw email/PII without explicit consent.

---

## Development Commands

### Root (run from repo root)

```bash
bun run dev          # Start all apps in parallel via Turborepo
bun run build        # Build all apps
bun run lint         # Biome linting across all workspaces
bun run typecheck    # Type-check all workspaces
bun run format       # Format TS, TSX, MD files

# Database
bun run db:push      # Push schema changes (dev only — no migration files)
bun run db:seed      # Seed the database
bun run db:reset     # Reset + push + seed

# MCP server
bun run mcp          # Run the MCP server from apps/api/mcp.ts
```

### Per-app

```bash
# apps/api
bun run dev          # ElysiaJS dev server with --watch
bun test             # Bun test runner

# apps/app
bun run dev          # Next.js dev (Turbopack)
bun run check:fix    # Biome check + autofix
bun run test:e2e     # Playwright E2E tests
bun run test:e2e:ui  # Playwright with UI mode
```

### Local Infrastructure

```bash
docker compose up -d  # Start PostgreSQL 16 (port 5432) and Redis 7 (port 6379)
```
