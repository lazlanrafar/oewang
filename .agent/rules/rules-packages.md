---
trigger: always_on
---

# packages/\* Architecture Rules

All shared code lives in `packages/`. Each package has a single responsibility. Import rules are strict.

---

# Import Permission Matrix

| Package          | apps/app                  | apps/api                  | Other packages |
| ---------------- | ------------------------- | ------------------------- | -------------- |
| `database`       | ❌ NEVER                  | ✅ repositories only      | ❌ NEVER       |
| `supabase`       | ✅ server only            | ✅ services only          | ❌ NEVER       |
| `bucket`         | ❌ NEVER                  | ✅ vault service only     | ❌ NEVER       |
| `encryption`     | ✅ axios interceptor only | ✅ encryption plugin only | ❌ NEVER       |
| `redis`          | ❌ NEVER                  | ✅ rate-limit + services  | ❌ NEVER       |
| `email`          | ❌ NEVER                  | ✅ services only          | ❌ NEVER       |
| `currencyfreaks` | ❌ NEVER                  | ✅ settings module only   | ❌ NEVER       |
| `types`          | ✅ everywhere             | ✅ everywhere             | ✅ everywhere  |
| `utils`          | ✅ everywhere             | ✅ everywhere             | ✅ everywhere  |
| `constants`      | ✅ everywhere             | ✅ everywhere             | ✅ everywhere  |
| `ui`             | ✅ components only        | ❌ NEVER                  | ❌ NEVER       |
| `dictionaries`   | ✅ via get-dictionary.ts  | ❌ NEVER                  | ❌ NEVER       |
| `logger`         | ❌ NEVER                  | ✅ everywhere             | ✅ everywhere  |

---

# packages/database

Drizzle ORM + PostgreSQL. Only package that talks to the database.

```
database/
  schema/             → one file per table (kebab-case, e.g. wallet-groups.ts)
  drizzle/            → generated SQL migrations — NEVER edit manually
  drizzle.config.ts
  client.ts           → singleton db client
  check_migrations.ts → migration integrity check
  index.ts            → re-exports: db + all schema + inferred types
  scripts/            → one-off data migration helpers (not runtime)
```

**Schema requirements:** Every workspace-scoped table MUST define `workspace_id` (FK → workspaces.id) and `deleted_at` (nullable timestamp). Export `$inferSelect` and `$inferInsert` types from each schema file.

**Current schema files:** `articles` · `audit-logs` · `categories` · `transactions` · `user-workspaces` · `users` · `vault-files` · `wallet-groups` · `wallets` · `workspace-invitations` · `workspace-settings` · `workspace-sub-currencies` · `workspaces`

**Migration workflow (mandatory order):**

```bash
# 1. Edit schema file(s)
# 2. Generate migration
bun run --cwd packages/database drizzle-kit generate
# 3. Review generated SQL (read-only — never edit)
# 4. Apply
bun run --cwd packages/database drizzle-kit migrate
```

Never skip step 2. Never manually edit files in `drizzle/`. `scripts/` helpers require explicit user confirmation before running.

---

# packages/types

Shared TypeScript contract. Types and constants only — zero runtime logic, zero DB imports.

```
types/
  api.ts          → ApiResponse<T>, PaginatedList<T>
  workspace.ts    → Workspace, WorkspaceMember, WorkspaceRole
  user.ts         → User, JWTPayload
  category.ts / transaction.ts / wallet.ts
  error-codes.ts  → ErrorCode const (SCREAMING_SNAKE_CASE)
  index.ts        → re-exports all
```

All error codes in one const object in `error-codes.ts`. Plan names and subscription tier constants here only — never hardcoded elsewhere. The legacy `packages/types/src/` directory is frozen — add new types at the package root.

---

# packages/utils

Pure TypeScript utilities. No framework, no DB, no HTTP.

```
utils/
  api-response.ts  → buildApiResponse() — used by all api services
  formatting.ts    → display formatters (number, date, string)
  pagination.ts    → buildPaginationMeta(), getPaginationOffset()
  env.ts           → typed env var accessors
  load-env.ts      → dotenv loader for non-Next.js contexts
  index.ts
```

All response building, pagination math, and formatting is centralized here. Never reimplement in apps.

---

# packages/constants

Static constants shared across apps. Zero runtime logic. Zero DB imports.

```
constants/
  countries.json        → ISO country list
  roles.ts              → WorkspaceRole const ("owner" | "admin" | "member")
  default/category.ts   → default category seeds (used in workspace onboarding)
  default/wallet.ts     → default wallet seeds
  index.ts
```

Import roles from `packages/constants/roles.ts` everywhere. Never use raw strings `"owner"`, `"admin"`, `"member"` in code. Default seeds are consumed by the onboarding service only — not used for runtime validation.

---

# packages/encryption

AES-256 encrypt/decrypt. Used in exactly two places:

1. `apps/api/plugins/encryption.ts` — encrypts all API responses
2. `apps/app/lib/axios.ts` — decrypts API responses (and encrypts request bodies)

Encryption key from `ENCRYPTION_KEY` in root `.env` only. Never log plaintext before encryption or after decryption.

---

# packages/redis

Redis client singleton. Used by `apps/api` only (rate-limit plugin, caching services). Falls back to in-memory Map in dev when `REDIS_URL` is not set — never in production.

---

# packages/supabase

```
supabase/
  client/
    admin.ts      → service role client — SERVER ONLY, never in apps/app
    client.ts     → browser-safe anon client
    middleware.ts → SSR middleware helpers
    server.ts     → server-side cookie-based client
    job.ts        → background job client
  queries/        → cached-queries.ts + index.ts
  mutations/      → index.ts
  types/          → db.ts (generated) + index.ts
  utils/          → account-matching.ts · storage.ts
```

`admin.ts` uses `SUPABASE_SERVICE_ROLE_KEY` — NEVER expose to the browser. `client.ts` uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` — safe for browser. Regenerate `types/db.ts` via Supabase CLI after schema changes.

---

# packages/bucket

S3-compatible object storage. Uses `src/` internally (pre-existing convention — do not change). Only `apps/api`'s vault service imports this. Storage credentials from `BUCKET_*` env vars.

---

# packages/currencyfreaks

CurrencyFreaks API client. Used exclusively by `apps/api/modules/settings` for exchange rate fetching. API key from `CURRENCYFREAKS_API_KEY`. Results should be cached in Redis to avoid excessive API calls.

---

# packages/email

Email sender + HTML templates. Only `apps/api` services call send functions. Templates in `templates/` use simple variable interpolation. SMTP config from root `.env`.

---

# packages/logger

Shared structured logger. Used by `apps/api` and packages only. `apps/app` uses Sentry instead.

**Never log:** passwords · JWT tokens · encryption keys · decrypted API payloads · `SUPABASE_SERVICE_ROLE_KEY`

Always include `workspace_id` and `user_id` (non-sensitive IDs) in error/warn log context for traceability.

---

# packages/dictionaries

i18n string files for `apps/app`.

```
dictionaries/
  en.json · id.json · ja.json
  index.ts → typed dictionary type
```

- All locales updated simultaneously when adding new strings
- Key format: `namespace.key_name` → `"wallet.create_success"`, `"common.save"`
- `apps/app` loads via `get-dictionary.ts` only — never imports JSON directly
- `apps/api` never imports dictionaries — API uses machine-readable error codes only
- Values are strings only — no nested objects, no arrays

---

# packages/ui

shadcn/ui component library. Uses `src/` internally (do not restructure). Only `apps/app` imports this. No business logic or API calls here. Add new components via `bunx shadcn add {component}` from `packages/ui`. App-specific UI primitives go in `apps/app/components/ui/` — not here.

---

# Adding a New Package

Before creating a new package, verify the functionality doesn't exist already.

Checklist:

1. Create at `packages/{name}/` — no `src/` unless a library convention requires it
2. Add `package.json` with name `@repo/{name}`
3. Add `tsconfig.json` extending `packages/typescript-config/base.json`
4. Add `index.ts` at package root as the public API
5. Register in root `turbo.json` if it has build steps
6. Add to the Import Permission Matrix in this file
7. Document its responsibility in this file

Never create a package that duplicates logic from an existing one. Extend existing packages instead.
