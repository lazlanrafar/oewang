# Architecture

> See also: [CLAUDE.md](../CLAUDE.md) · [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md) · [BEST_PRACTICE_ELYSIA.md](./BEST_PRACTICE_ELYSIA.md) · [BEST_PRACTICE_NEXT_JS.md](./BEST_PRACTICE_NEXT_JS.md)

oewang is a **multi-workspace financial SaaS** built as a Turborepo monorepo. Every design decision traces back to three pillars: **workspace isolation**, **encrypted data transport**, and **layered module boundaries**.

---

## Monorepo Structure

```
oewang/
├── apps/
│   ├── app/        # Next.js 16 — Main SaaS application (port 3000)
│   ├── admin/      # Next.js — Internal admin dashboard (port 3001)
│   ├── api/        # ElysiaJS/Bun — REST API + MCP server (port 3002)
│   ├── website/    # Next.js — Marketing website (port 3003)
│   └── native/     # Flutter — Mobile app (Dart/Flutter 3.11+)
└── packages/
    ├── ai/             # AI service abstractions (OpenAI, Anthropic, Gemini)
    ├── bucket/         # S3-compatible object storage client
    ├── constants/      # Shared static constants (roles, colors, config, env)
    ├── currencyfreaks/ # CurrencyFreaks exchange rate client
    ├── database/       # Drizzle ORM + PostgreSQL (32 tables)
    ├── dictionaries/   # i18n JSON files (en, id, ja)
    ├── email/          # Resend email sender + HTML templates
    ├── encryption/     # AES-256-GCM encrypt/decrypt
    ├── eslint-config/  # Shared ESLint configuration
    ├── integrations/   # 40+ third-party integrations (Slack, Stripe, etc.)
    ├── logger/         # Pino-based structured logger
    ├── modules/        # Server actions and data-fetching logic (app-side)
    ├── playwright/     # Shared Playwright E2E configuration
    ├── redis/          # Upstash Redis client singleton
    ├── supabase/       # Supabase clients (server, client, admin, middleware)
    ├── types/          # Shared TypeScript types + error codes (no runtime)
    ├── typescript-config/ # Shared tsconfig bases
    ├── ui/             # shadcn/ui + Radix UI + Tailwind CSS v4 components
    └── utils/          # Pure TS utilities (api-response, formatting, pagination)
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        apps/app                             │
│                    (Next.js 16 SaaS)                        │
│                                                             │
│  pages / components → packages/modules (server actions)     │
│                         → packages/database (Drizzle)       │
│                               → PostgreSQL (Supabase)       │
│                                                             │
│  pages / components → apps/api (ElysiaJS REST)              │
│                         → packages/database                 │
│                         → packages/integrations             │
│                         → packages/ai                       │
└─────────────────────────────────────────────────────────────┘
          ↑ Encrypted REST (AES-256-GCM)
          ↓ x-encrypted: true header
┌─────────────────────────────────────────────────────────────┐
│                       apps/api                              │
│  Request → authPlugin → rateLimitPlugin → controller        │
│                                          → service          │
│                                          → repository       │
│                                          → database         │
└─────────────────────────────────────────────────────────────┘
```

### Encryption Transport

All REST API responses are AES-256-GCM encrypted via `packages/encryption`:

- **Server side**: `apps/api/plugins/encryption.ts` — encrypts every JSON response, decrypts request bodies when `x-encrypted: true` header is present.
- **Client side**: `apps/app/lib/axios.ts` — the single HTTP client; interceptors decrypt incoming responses and encrypt outgoing request bodies.

> See [BEST_PRACTICE_ELYSIA.md](./BEST_PRACTICE_ELYSIA.md) for plugin details.

---

## apps/api — ElysiaJS Backend

### Layer Flow (STRICT — no layer may skip another)

```
Request
  → Plugin (auth, rate-limit)
  → Controller   (routes + validation + response encryption)
  → Service      (business logic, plan gates, audit logs)
  → Repository   (DB queries — only layer with @workspace/database)
  → Database     (PostgreSQL via Drizzle ORM)
```

### Module Structure

Every feature lives in `apps/api/modules/{feature}/`:

```
modules/wallets/
  wallets.controller.ts   — Elysia instance: routes + TypeBox validation
  wallets.service.ts      — abstract class with static methods
  wallets.repository.ts   — DB queries only, workspace filter required
  wallets.dto.ts          — Elysia.t TypeBox schemas
  wallets.utils.ts        — Pure helper functions (testable, no side effects)
  wallets.utils.test.ts   — Unit tests for utils
  __tests__/              — Service / repository / controller tests
  groups/                 — Sub-module (same layered structure)
  items/                  — Sub-module
```

**File naming rules:**
- `.controller.ts` — the Elysia instance (routes)
- `.service.ts` — `abstract class` with `static` methods
- `.repository.ts` — DB queries; imports `@workspace/database`
- `.dto.ts` — for features with complex request/response shapes (wallets, vault, settings)
- `.model.ts` — for primary DB-mapped resource shapes (categories, transactions)
- `.utils.ts` — pure functions; always paired with `.utils.test.ts`

**No `index.ts` inside `modules/{feature}/`.** Controllers imported directly in `apps/api/index.ts`.

### Plugins

```
apps/api/plugins/
  auth.ts         — JWT verify (app JWT + Supabase token fallback)
                    sets `auth` on context, null if unauthenticated
  encryption.ts   — AES-256-GCM: decrypts request bodies, encrypts all responses
  logger.ts       — Pino request logging
  rate-limit.ts   — Redis-backed sliding window:
                      authenticated: 300 req/min per workspace_id
                      unauthenticated: 30 req/min per IP
                      auth endpoints: 10 req/15min per IP
```

### Registered Controllers (apps/api/index.ts)

All routes grouped under `/v1`:
`health` · `users` · `workspaces` · `auth` · `settings` · `categories` · `budgets` · `wallets` · `vault` · `transactions` · `ai` · `metrics` · `integrations` · `system-admins` · `pricing` · `mayar` · `orders` · `system-metrics` · `privacy` · `invoices` · `contacts` · `debts` · `notifications` · `notification-settings` · `push-subscriptions`

Public routes (no auth): `public-pricing` · `public-invoices`

WebSocket: `/v1/realtime` — workspace-scoped pub/sub via Bun server

### Environment Validation

`apps/api/config/env.ts` validates all required vars with Zod at startup. The API **refuses to start** if any required variable is missing. See [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md#environment-variables) for the full variable list.

---

## apps/app — Next.js 16 Frontend

### Route Structure

```
apps/app/app/
  (api)/api/auth/callback/   — Supabase OAuth callback handler
  (main)/[locale]/
    (auth)/
      login/                 — Public login page
      register/              — Public registration
      accept-invite/         — Workspace invitation acceptance
      create-workspace/      — Onboarding: first workspace creation
      sync/                  — Auth state synchronization
    (dashboard)/             — Authenticated app shell
      overview/
      transactions/
      accounts/              — Wallet management
      budget/
      debts/
      invoices/
      contacts/
      vault/
      chat/[id]/             — AI assistant
      apps/                  — Integrations hub
      calendar/
      notifications/
      settings/
        account/ · profile/ · appearance/ · language/
        currency/ · billing/ · members/ · notifications/
        expense-category/ · income-category/
        transaction/ · wallets-and-banks/
    invoice/[token]/         — Public shareable invoice view
```

### Directory Responsibilities

| Directory | Purpose |
|-----------|---------|
| `actions/` | REST wrappers only — the ONLY place HTTP calls are made |
| `app/[locale]/` | Next.js App Router pages (thin orchestrators) |
| `components/` | React components organized by feature domain |
| `lib/` | Client utilities: axios, workspace-permissions |
| `hooks/` | Custom React hooks (client-only) |
| `stores/` | Client state (Zustand) |
| `navigation/` | Sidebar/nav config objects (no rendering logic) |
| `server/` | Next.js Server Actions |
| `modules/types/` | App-local UI types |

**`actions/`** calls go through `lib/axios.ts` which handles encryption/decryption automatically. Current action files: `mayar.actions.ts` · `notification.actions.ts` · `push-subscription.actions.ts`

### i18n

All routes are under `app/(main)/[locale]/`. Supported locales configured in `i18n-config.ts`. Dictionary files live in `packages/dictionaries/` (`en.json`, `id.json`, `ja.json`). Loaded via `get-dictionary.ts` in server components.

---

## packages/database — Schema

Drizzle ORM + PostgreSQL. The **only** package that directly talks to the database.

**32 schema tables** (all in `packages/database/schema/`):

`ai-messages` · `ai-sessions` · `articles` · `audit-logs` · `budgets` · `categories` · `contacts` · `debt-payments` · `debts` · `invoices` · `notification-settings` · `notifications` · `orders` · `pricing` · `privacy-requests` · `push-subscriptions` · `system-settings` · `transaction-attachments` · `transaction-items` · `transactions` · `user-workspaces` · `users` · `vault-files` · `wallet-groups` · `wallets` · `webhook-events` · `workspace-addons` · `workspace-integrations` · `workspace-invitations` · `workspace-settings` · `workspace-sub-currencies` · `workspaces`

**Every workspace-scoped table MUST have:**
- `workspace_id` (FK → `workspaces.id`)
- `deleted_at` (nullable timestamp — soft delete only, NEVER `DELETE`)

**Migration workflow (mandatory order):**
```bash
# 1. Edit schema file(s) in packages/database/schema/
# 2. Generate migration SQL
bun run --cwd packages/database drizzle-kit generate
# 3. Review generated SQL (read-only — never edit drizzle/ manually)
# 4. Apply migration
bun run --cwd packages/database drizzle-kit migrate
```

---

## Multi-Workspace Model

**Users ↔ Workspaces** is a many-to-many via `user_workspaces`:

```sql
user_workspaces: { user_id, workspace_id, role, joined_at, deleted_at }
```

- Roles: `owner` | `admin` | `member` (defined in `packages/constants/src/roles.ts`)
- `users.workspace_id` = the active workspace (set on first join, updated on switch)
- Workspace context resolved from JWT `workspace_id` → `x-workspace-id` header → DB fallback
- JWT always wins on conflict

**NEVER:**
- Store workspaces as a JSON/array column on `users`
- Skip the `user_workspaces` membership check
- Return data without `workspace_id` filter
- Return soft-deleted records without `isNull(deleted_at)`

---

## Auth Model

Hybrid JWT + Supabase:

1. `apps/app` authenticates via Supabase → receives Supabase token
2. On first API call, the Supabase token is exchanged for an app JWT (`{ user_id, workspace_id, email, system_role }`)
3. All subsequent API calls use the app JWT via `Authorization: Bearer <token>` or `oewang-session` cookie
4. `authPlugin` (`apps/api/plugins/auth.ts`) verifies the JWT, validates workspace membership, resolves active workspace, and sets `auth` on context

**NEVER** trust `workspace_id` from request body or query params. Always use `auth.workspace_id` from the plugin.

---

## Observability

| Layer | Tool |
|-------|------|
| `apps/api` | Sentry (`instrument.ts` — must be first import) + Pino logger |
| `apps/app` | Sentry (`instrumentation.ts` server + `sentry.client.config.ts` browser) |
| Structured logging | `@workspace/logger` (Pino-based) — `never console.log` in shared code |

**Never attach to Sentry:** passwords · JWT tokens · encryption keys · decrypted API payloads

---

## Package Import Matrix

| Package | apps/app | apps/api | Other packages |
|---------|----------|----------|----------------|
| `database` | ❌ NEVER | ✅ repositories only | ❌ NEVER |
| `supabase` | ✅ server only | ✅ services only | ❌ NEVER |
| `bucket` | ❌ NEVER | ✅ vault service only | ❌ NEVER |
| `encryption` | ✅ axios interceptor only | ✅ encryption plugin only | ❌ NEVER |
| `redis` | ❌ NEVER | ✅ rate-limit + services | ❌ NEVER |
| `ai` | ❌ NEVER | ✅ ai module only | ❌ NEVER |
| `integrations` | ❌ NEVER | ✅ integrations module | ❌ NEVER |
| `email` | ❌ NEVER | ✅ services only | ❌ NEVER |
| `types` | ✅ everywhere | ✅ everywhere | ✅ everywhere |
| `utils` | ✅ everywhere | ✅ everywhere | ✅ everywhere |
| `constants` | ✅ everywhere | ✅ everywhere | ✅ everywhere |
| `ui` | ✅ components only | ❌ NEVER | ❌ NEVER |
| `dictionaries` | ✅ via get-dictionary.ts | ❌ NEVER | ❌ NEVER |
| `logger` | ❌ NEVER | ✅ everywhere | ✅ everywhere |
| `modules` | ✅ server actions only | ❌ NEVER | ❌ NEVER |

---

## `src/` Directory Rule

`src/` is **forbidden everywhere** with exactly **two exceptions**:
- `packages/ui/src/` — shadcn component library convention
- `packages/bucket/src/` — pre-existing package structure

All other packages and apps use **package root** (not `src/`).

---

## CI Checklist

```bash
bun run typecheck    # zero TypeScript errors
bun run lint         # zero Biome violations
bun run test         # 399+ unit tests pass (~134ms)
bun run test:e2e     # 115+ Playwright E2E tests pass
bun run build        # clean production build
```

> See [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md) for naming, typing, and git branch conventions.
