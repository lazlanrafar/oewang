---
trigger: always_on
---

# packages/\* Architecture Rules

All shared code lives in `packages/`. Each package has a single responsibility. Import rules are strict.

> See also: [docs/ARCHITECTURE.md](file:///Users/boneconsulting/Developer/oewang/docs/ARCHITECTURE.md)

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
  client.ts           → singleton db client
  index.ts            → re-exports: db + all schema + inferred types
```

- **Schema requirements:** Every workspace-scoped table MUST define `workspace_id` (FK → workspaces.id) and `deleted_at` (nullable timestamp). Export `$inferSelect` and `$inferInsert` types from each schema file.
- **Migration workflow:** Edit schema -> generate migration (`bun run --cwd packages/database drizzle-kit generate`) -> review SQL -> apply (`bun run --cwd packages/database drizzle-kit migrate`).

---

# packages/types

Shared TypeScript contract. Types and constants only — zero runtime logic, zero DB imports.
- All error codes in `error-codes.ts` as `const ErrorCode`.
- **Type Isolation constraint:** Shared models and select types (such as `Notification`, `NotificationSetting`, etc.) must be defined here as plain TypeScript contracts so that client actions, hooks, and pages do not import from `@workspace/database`, preserving strict package layering.

---

# packages/utils & constants

- **packages/utils**: Pure TS utilities (formatting, API responses, pagination). No framework, DB, or HTTP.
- **packages/constants**: Static constants (roles, countries, default seeds). Import roles from `packages/constants/roles.ts` everywhere. Never use raw strings.

---

# Other Specialized Packages

- **packages/encryption**: AES-256 encrypt/decrypt. Used in `apps/api/plugins/encryption.ts` and `apps/app/lib/axios.ts` interceptors.
- **packages/redis**: Redis client singleton. Falls back to in-memory Map in dev when `REDIS_URL` is unset.
- **packages/supabase**: Supabase clients, queries, mutations, types. `admin.ts` (SERVER ONLY, never in frontend) uses `SUPABASE_SERVICE_ROLE_KEY`. `client.ts` uses anonymous browser-safe key.
- **packages/bucket**: S3-compatible storage client. Used only by vault service in `apps/api`.
- **packages/currencyfreaks**: CurrencyFreaks API client. Cash results in Redis to avoid excessive API calls.
- **packages/email**: SMTP mail sender + simple HTML templates.
- **packages/logger**: Shared structured logger. Never log passwords, JWT tokens, keys, decrypted payloads. Always include `workspace_id` and `user_id` context.
- **packages/dictionaries**: i18n JSON files (`en.json`, `id.json`, `ja.json`). All locales must be updated simultaneously.
- **packages/ui**: shadcn/ui library (`src/` internally). Imported in `apps/app` only.

---

# Adding a New Package

Checklist:
1. Create at `packages/{name}/` — no `src/` unless standard library convention requires it.
2. Add `package.json` with name `@repo/{name}`.
3. Add `tsconfig.json` extending base.
4. Add `index.ts` at package root.
5. Register in `turbo.json` if it has build steps.
6. Register in Import Permission Matrix.
