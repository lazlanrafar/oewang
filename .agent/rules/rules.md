---
trigger: always_on
---

# AI AGENT ENFORCED ARCHITECTURE RULES

## Multi-Workspace SaaS — Turborepo — Encrypted REST

Single source of truth. No deviation allowed.

---

# System Overview

**Stack:** Turborepo · Bun · Next.js (`apps/app`) · ElysiaJS (`apps/api`) · PostgreSQL · Drizzle ORM · Redis · Supabase (auth/storage) · Sentry

**Flow:** `apps/app` → Encrypted REST → `apps/api` → Database

---

# Monorepo Structure

```
apps/app/
  actions/          → REST wrappers only (*.actions.ts)
  app/[locale]/     → Next.js App Router pages with i18n
  components/       → All UI components
  lib/              → Client utilities (axios, cookie, currency, preferences, fonts)
  hooks/            → Custom React hooks
  stores/           → Client state (Zustand or equivalent)
  navigation/       → Sidebar/nav config
  server/           → Next.js Server Actions (server-actions.ts)
  config/           → App-level config (app-config.ts)
  types/            → App-local types only (e.g. settings.ts)
  data/             → Static/seed data consumed by UI
  middleware.ts     → Auth + workspace guard only

apps/api/
  modules/{feature}/  → controller · service · repository · model|dto · __tests__/
  plugins/            → auth · encryption · logger · rate-limit
  config/             → env.ts (startup validation)
  index.ts
  instrument.ts       → Sentry instrumentation

packages/
  bucket/           → Object/file storage client (S3-compatible)
  constants/        → countries.json · roles.ts · default/category.ts · default/wallet.ts
  currencyfreaks/   → CurrencyFreaks API client
  database/         → Drizzle ORM: schema/ · drizzle/ · client.ts · drizzle.config.ts · index.ts
  dictionaries/     → i18n JSON files (en · id · ja) + index.ts
  email/            → Email sender + templates/
  encryption/       → AES encryption utilities
  eslint-config/    → Shared ESLint configs
  logger/           → Shared logger
  redis/            → Redis client singleton
  supabase/         → Supabase client · queries · mutations · types · utils
  types/            → Shared TypeScript types + error codes (no runtime logic)
  typescript-config/→ Shared tsconfig bases
  ui/               → shadcn/ui components (uses src/ internally)
  utils/            → Pure TS utilities (api-response · formatting · pagination · env · load-env)
```

---

# `src/` Directory Rule

`src/` is **forbidden everywhere** with exactly **two exceptions**:

- `packages/ui/src/` — shadcn component library convention
- `packages/bucket/src/` — existing package structure

All other packages and apps MUST NOT use `src/`. No new packages should adopt `src/`.

---

# Multi-Workspace Rules (CRITICAL)

Every workspace-scoped table MUST have `workspace_id` + `deleted_at`.

**Workspace context priority:** JWT `workspace_id` → `x-workspace-id` header → subdomain. JWT always wins on conflict.

All repository queries MUST filter by `workspace_id` and `deleted_at: null`. No cross-workspace joins. No global queries without explicit super-admin role check.

```ts
where: { workspace_id, deleted_at: null }
```

**Forbidden:** hardcoded workspace IDs · super-admin bypass without role check · returning data without workspace validation.

---

# User ↔ Workspace Model (CRITICAL)

**users table:** `workspace_id FK → workspaces.id` (active workspace, nullable until first join)

**user_workspaces table:** `{ user_id, workspace_id, role: "owner" | "admin" | "member", joined_at }`

- Workspace membership resolved via `user_workspaces` join table. NEVER an array/JSON column on users.
- `workspace_id` on users auto-set on first join. Updated on workspace switch. Null or reassigned on leave.
- Roles defined in `packages/constants/roles.ts` only — never hardcoded strings inline.

**JWT MUST include:** `{ user_id, workspace_id }`

**Forbidden:** array/JSON workspaces column on users · skipping `user_workspaces` membership check · JWT without `workspace_id` · access without a membership row.

---

# apps/app Rules

UI and REST consumer only. No DB access. No business logic. No direct ElysiaJS imports.

**`apps/app` CANNOT import `packages/database` or `packages/supabase` in client components.**

### Directory Responsibilities

**`actions/`** — REST wrappers only. One file per feature: `auth.actions.ts`, `wallet.actions.ts`, etc. Files call the encrypted API via axios and return typed responses. No DB, no business logic, no direct Drizzle usage.

**`app/[locale]/`** — Next.js App Router with i18n locale segment. Route groups: `(auth)/` for public auth pages, `(main)/` for authenticated app shell. Page components are thin — they import from `components/` and call `actions/`. No API calls directly in page files.

**`components/`** — All React components. Organized by feature domain (auth, layout, setting, transactions, vault, wallets, shared) plus `ui/` for primitives. PascalCase files. No business logic. Server components may call `actions/`; client components use hooks/stores.

**`lib/`** — Client-side utilities: `axios.ts` (configured instance with encryption interceptors), `cookie.client.ts`, `currency.ts`, `local-storage.client.ts`, `fonts/`, `preferences/`. No DB, no API routes.

**`hooks/`** — Custom React hooks (`use-currency.ts`, `use-localized-route.ts`, etc.). Hooks may use stores or call actions. Must be client-only (`"use client"`).

**`stores/`** — Client state management (Zustand). Stores are client-only. Do not persist sensitive data to localStorage without encryption.

**`navigation/`** — Sidebar and nav config objects only. No rendering logic.

**`server/`** — Next.js Server Actions (`server-actions.ts`). May call `actions/` or use server-only utilities. Never expose raw DB queries.

**`config/`** — App-level configuration constants (`app-config.ts`). No secrets; only public-safe config.

**`types/`** — App-local types that are not shared across apps (e.g., `settings.ts`). Shared types belong in `packages/types`.

**`data/`** — Static data consumed by UI (e.g., `users.ts` for mock/seed display). No business logic.

**`middleware.ts`** — Auth + workspace guard only:

- Verify JWT, redirect unauthenticated users to `/login`
- Detect `workspace_id`, redirect no-workspace users to onboarding
- Handle i18n locale detection/redirect
- CANNOT: contain business logic · call DB · call `apps/api` directly

### i18n Rules

- All routes nested under `app/[locale]/`. Supported locales configured in `i18n-config.ts`.
- Dictionary strings loaded via `get-dictionary.ts`. Dictionary files live in `packages/dictionaries/`.
- Hard-coded user-facing strings in components are FORBIDDEN. All copy goes through the dictionary system.
- Locale-aware navigation via `hooks/use-localized-route.ts`.

### Sentry (apps/app)

- `instrumentation.ts` initializes Sentry on the server.
- `sentry.client.config.ts` initializes Sentry on the client.
- `sentry.server.config.ts` for server-side config.
- Never log decrypted payloads or secrets to Sentry. Scrub PII before sending.

---

# apps/api Rules

Only layer allowed to: access DB · contain business logic · handle workspace validation.

**Layer flow:** `Controller → Service → Repository → Database`

### Controller

- Route definition + TypeBox input validation + call service + encrypt response.
- No DB access. No business logic. No plan logic.
- File naming: `{feature}.controller.ts`. For sub-features: `rates.controller.ts` inside the parent module folder.
- Register routes on the Elysia app instance exported from `modules/{feature}/index.ts`.

### Service

- All business logic: workspace validation · plan enforcement · orchestration · audit log writes.
- No HTTP primitives (no `ctx`, no status codes).
- File naming: `{feature}.service.ts`.

### Repository

- Only layer importing `packages/database`. Enforces `workspace_id` + `deleted_at: null` on all reads.
- No business logic. Never hard-delete workspace-scoped records. Use soft delete (`deleted_at = now()`).
- File naming: `{feature}.repository.ts`.

### Model / DTO Files

- TypeBox schemas for request/response validation live in `{feature}.model.ts` OR `{feature}.dto.ts`.
- Use `.model.ts` when the file defines the primary resource shape (categories, users, workspaces, transactions).
- Use `.dto.ts` when the file defines request/response transfer objects for a service with complex sub-operations (vault, wallets, settings).
- Never duplicate TypeBox schema definitions across files. One source per shape.

### Auth Module

- `auth.controller.ts` — route definitions and TypeBox validation.
- `utils.ts` — auth-specific helpers (token generation, bcrypt helpers). Acceptable to skip separate service/repository for pure auth logic that doesn't require workspace DB queries.
- Workspace-scoped auth actions (e.g. invite acceptance) MUST go through a proper service+repository.

### Sub-module Pattern

For features with sub-resources (e.g. `wallets/groups/`, `wallets/items/`, `settings/sub-currencies/`):

- Create a sub-directory under the parent module.
- Sub-module follows the same controller/service/repository pattern.
- Parent module `index.ts` registers all sub-module routes.

### Sentry (apps/api)

- `instrument.ts` at api root initializes Sentry. Import first in `index.ts` before anything else.
- Never send raw error objects, stack traces, or decrypted payloads to Sentry.

---

# packages/ Rules

## packages/database

Drizzle ORM only.

```
schema/           → one file per table (users.ts, workspaces.ts, wallets.ts, etc.)
drizzle/          → generated migration SQL files — NEVER edit manually
drizzle.config.ts → Drizzle Kit config
client.ts         → db client singleton
check_migrations.ts → migration integrity check
index.ts          → re-exports client + schema + types
```

- Singleton DB client. Migrations generated via `drizzle-kit generate`, applied via `drizzle-kit migrate`.
- Schema changes require `drizzle-kit generate` before `drizzle-kit migrate`. No exceptions.
- Every workspace-scoped table MUST define `workspace_id` and `deleted_at` columns in its schema file.
- Only `apps/api` repositories may import this package.
- `scripts/` inside database are one-off migration helpers. Do not add business logic here.

**Current schema files:** `articles.ts · audit-logs.ts · categories.ts · transactions.ts · user-workspaces.ts · users.ts · vault-files.ts · wallet-groups.ts · wallets.ts · workspace-invitations.ts · workspace-settings.ts · workspace-sub-currencies.ts · workspaces.ts`

## packages/types

Shared TypeScript contract for all apps. Types + constants only. No runtime logic. No DB imports.

```
api.ts          → ApiResponse<T>, pagination types
workspace.ts    → Workspace, WorkspaceMember types
user.ts         → User types
category.ts     → Category types
transaction.ts  → Transaction types
wallet.ts       → Wallet, WalletGroup types
error-codes.ts  → ErrorCode const (SCREAMING_SNAKE_CASE)
index.ts        → re-exports all
```

- All error codes defined here as `const ErrorCode = { WORKSPACE_NOT_FOUND, FORBIDDEN, ... }`.
- Plan names defined here only — never hardcoded elsewhere.
- Never duplicated across apps.
- The `src/` sub-directory inside `packages/types` is a legacy artifact — do not add new files there; place all types at the package root.

## packages/constants

Shared static constants. No runtime logic. No DB imports.

```
countries.json      → ISO country list
roles.ts            → Role definitions ("owner" | "admin" | "member")
default/category.ts → Default category seeds
default/wallet.ts   → Default wallet seeds
index.ts            → re-exports
```

- Role strings imported from here everywhere — never hardcoded as plain strings.
- Default seed data used by `packages/database/seed` and onboarding logic only.

## packages/utils

Pure TypeScript utilities. No DB, no framework code.

```
api-response.ts  → ApiResponse builder helpers
formatting.ts    → Display formatting
pagination.ts    → Pagination helpers
env.ts           → Env var accessors
load-env.ts      → Env loadi
```
