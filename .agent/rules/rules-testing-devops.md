---
trigger: always_on
---

# Testing, MCP, Security & DevOps Rules

---

# Testing (Bun Test Runner)

## File Location

Tests co-located inside `__tests__/` within each module:

```
modules/wallets/__tests__/
  wallets.service.test.ts
  wallets.repository.test.ts
  wallets.controller.test.ts
  mocks/
    wallets.repository.mock.ts
```

## Coverage Requirements

| Layer      | Test type                  | Minimum                             |
| ---------- | -------------------------- | ----------------------------------- |
| Service    | Unit (repository mocked)   | ≥ 80% branch coverage               |
| Repository | Integration (real test DB) | ≥ 1 happy + 1 error path per method |
| Controller | Integration (HTTP)         | All status codes + input validation |
| Utils      | Unit                       | ≥ 90%                               |

Zero coverage on any service file is forbidden. A feature without a service test is incomplete.

## Test Name Format

```
should {expected behaviour} when {condition}
```

Example: `should return CONFLICT when a wallet with the same name exists`

## Service Unit Tests

Repository MUST be mocked — never hit a real DB in service tests.

```ts
// mocks/wallets.repository.mock.ts
export const mockWalletsRepository = {
  findByName: mock(() => Promise.resolve(null)),
  create: mock((input) => Promise.resolve({ id: "uuid", ...input })),
  softDelete: mock(() => Promise.resolve()),
};

// wallets.service.test.ts
const service = new WalletsService(mockWalletsRepository);

it("should return CONFLICT when wallet name already exists", async () => {
  mockWalletsRepository.findByName.mockResolvedValue({ id: "existing" });
  const result = await service.create(
    { name: "Savings", currency: "USD" },
    "ws1",
    "user1",
  );
  expect(result.body.success).toBe(false);
  expect(result.body.code).toBe("CONFLICT");
  expect(result.status).toBe(409);
});
```

## Repository Integration Tests

Use `.env.test` DB. Reset between runs with `drizzle-kit migrate` against a clean test DB.

**Workspace isolation assertion is mandatory** in every repository test file:

```ts
it("should return only wallets for the queried workspace", async () => {
  await repo.create({ name: "A", currency: "USD", workspace_id: workspace_a });
  await repo.create({ name: "B", currency: "EUR", workspace_id: workspace_b });
  const { rows } = await repo.findAll(workspace_a, 1, 20);
  expect(rows.every((r) => r.workspace_id === workspace_a)).toBe(true);
});

it("should not return soft-deleted records", async () => {
  const wallet = await repo.create({
    name: "Gone",
    currency: "USD",
    workspace_id: workspace_a,
  });
  await repo.softDelete(wallet.id, workspace_a);
  const { rows } = await repo.findAll(workspace_a, 1, 20);
  expect(rows.find((r) => r.id === wallet.id)).toBeUndefined();
});
```

## Running Tests

```bash
bun test                                    # all tests
bun test apps/api/modules/wallets          # single module
bun test --watch                           # watch mode
bun test --coverage                        # with coverage
```

---

# MCP Workflow (mandatory before writing any code)

Guessing is forbidden. Read real project context before writing code.

## Required MCP Servers

Configured in `.mcp.json` at project root (committed to version control). Secrets via `.env` references only — never hardcoded.

- `filesystem` — read/write project files
- `postgres` — verify live table/column state
- `github` — check open branches and PRs
- `shell` — run type checks, tests, builds

## Mandatory Execution Order

```
BEFORE writing code:
1. filesystem → read target module (all files in modules/{feature}/)
2. filesystem → read packages/database/schema/ (relevant tables)
3. filesystem → read packages/types/ and packages/constants/
4. postgres   → \d {table_name} — confirm live columns and types
5. github     → check open PRs and branches for this module

WRITE CODE

AFTER writing code:
6. shell → bun run typecheck
7. shell → bun run lint
8. shell → bun test apps/api/modules/{feature}
9. shell → bun run build

IF schema changed:
10. shell → drizzle-kit generate
11. review generated SQL (read-only, never edit)
12. shell → drizzle-kit migrate
13. shell → bun run build (re-verify)
```

## Git Branching

- Features: `feature/{name}` — Bugs: `fix/{name}`
- Never commit directly to `main` or `dev`
- Open a PR for every change — check for open PRs on the same module before starting

## MCP Security

| Server       | Restriction                                                                     |
| ------------ | ------------------------------------------------------------------------------- |
| `filesystem` | Project root only — no system paths (`/etc`, `~/.ssh`)                          |
| `postgres`   | Limited user — never superuser, never `DROP` without confirmation               |
| `shell`      | Never run `DROP TABLE`, `rm -rf`, `TRUNCATE` without explicit user confirmation |
| `github`     | `repo` scope only — dev/CI use only, never production deploys                   |

---

# Security Rules

## Authentication

- `workspace_id` and `user_id` sourced from `jwt_payload` only — never from request body or query params
- Passwords hashed with bcrypt, minimum cost factor 12
- JWT payload: `{ user_id, workspace_id, role, iat, exp }` — no sensitive data beyond this
- Failed auth attempts rate-limited: 10 req/15min per IP on auth endpoints

## Secrets Management

```
Root .env (shared, never committed):
  ENCRYPTION_KEY · DATABASE_URL · JWT_SECRET · JWT_EXPIRES_IN
  REDIS_URL · SUPABASE_URL · SUPABASE_ANON_KEY · SUPABASE_SERVICE_ROLE_KEY
  CURRENCYFREAKS_API_KEY · SMTP_* · BUCKET_* · SENTRY_DSN

apps/api adds: PORT · API_BASE_URL
apps/app adds (NEXT_PUBLIC_ = browser-safe only):
  NEXT_PUBLIC_API_URL · NEXT_PUBLIC_APP_URL
  NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_ANON_KEY · NEXT_PUBLIC_SENTRY_DSN
```

- `NEXT_PUBLIC_` vars are bundled into the browser — never put anything secret in them
- `.env` and `.env.test` are gitignored — never committed
- `.env.test` uses separate test DB and Redis — never points to production
- All vars validated at `apps/api` startup via `config/env.ts` — app refuses to start if any are missing

## Input Validation

All incoming data validated with TypeBox in the controller before the service layer:

- Invalid input returns `400` + `ErrorCode.VALIDATION_ERROR` — never reaches service
- Sanitize strings: trim whitespace, normalize case where appropriate (e.g. currency codes → uppercase)
- File uploads: validate MIME type and file size server-side in `apps/api` before storing to bucket

## Data Protection

Never log: passwords · JWT tokens · encryption keys · decrypted API bodies · `SUPABASE_SERVICE_ROLE_KEY`

Sentry events must be scrubbed before dispatch — use `beforeSend` to strip sensitive fields. Audit log `before`/`after` fields must exclude passwords and tokens.

---

# Environment Variable Validation

`apps/api/config/env.ts` validates all required vars at startup. App MUST refuse to start with missing required vars — never silently continue.

---

# Observability (Sentry)

**`apps/api/instrument.ts`** — first import in `index.ts` before anything else. Captures unhandled exceptions and route errors.

**`apps/app`** — three files: `instrumentation.ts` (server), `sentry.client.config.ts` (browser), `sentry.server.config.ts`.

What to attach: `workspace_id`, `user_id`, route path, feature name (non-sensitive identifiers only)

What NEVER to attach: decrypted payloads · JWT tokens · passwords · `SUPABASE_SERVICE_ROLE_KEY` · raw request bodies

---

# CI Checklist (required before every merge)

```bash
bun run typecheck    # zero TypeScript errors
bun run lint         # zero lint violations
bun test --coverage  # all tests pass, coverage thresholds met
bun run build        # clean production build

# If schema changed — also run:
bun run --cwd packages/database drizzle-kit generate
bun run --cwd packages/database drizzle-kit migrate
bun run build        # re-verify after migration
```

All four checks must pass. PRs with failing typecheck or lint are blocked from merge.
