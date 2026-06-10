---
trigger: always_on
---

# Testing, MCP, Security & DevOps Rules

> See also: [docs/TESTING_UNIT.md](file:///Users/boneconsulting/Developer/oewang/docs/TESTING_UNIT.md) · [docs/TESTING_E2E.md](file:///Users/boneconsulting/Developer/oewang/docs/TESTING_E2E.md)

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

- **Service**: Unit (repository mocked) · ≥ 80% branch coverage
- **Repository**: Integration (real test DB) · ≥ 1 happy + 1 error path per method
- **Controller**: Integration (HTTP) · All status codes + input validation
- **Utils**: Unit · ≥ 90%
  _Zero coverage on any service file is forbidden._

## Test Name Format

`should {expected behaviour} when {condition}`
Example: `should return CONFLICT when a wallet with the same name exists`

## Service Unit Tests

Repository MUST be mocked — never hit a real DB in service tests.

```ts
// mocks/wallets.repository.mock.ts
export const mockWalletsRepository = {
  findByName: mock(() => Promise.resolve(null)),
  create: mock((input) => Promise.resolve({ id: "uuid", ...input })),
};
```

## Repository Integration Tests

Use `.env.test` DB. **Workspace isolation assertion is mandatory** in every repository test file:

```ts
it("should return only wallets for the queried workspace", async () => {
  await repo.create({ name: "A", currency: "USD", workspace_id: workspace_a });
  await repo.create({ name: "B", currency: "EUR", workspace_id: workspace_b });
  const { rows } = await repo.findAll(workspace_a, 1, 20);
  expect(rows.every((r) => r.workspace_id === workspace_a)).toBe(true);
});
```

---

# MCP Workflow (MANDATORY)

Guessing is forbidden. Read real project context before writing code.

## Mandatory Execution Order

1. **filesystem** → read target module (`modules/{feature}/`)
2. **filesystem** → read relevant database schemas (`packages/database/schema/`)
3. **filesystem** → read types/constants
4. **postgres** → confirm live columns (`\d {table}`)
5. **github** → check open PRs and branches for the module
6. **WRITE CODE**
7. **shell** → run `bun run typecheck`
8. **shell** → run `bun run lint`
9. **shell** → run `bun test apps/api/modules/{feature}`
10. **shell** → run `bun run build`
11. **drizzle** → (If schema changed) run `drizzle-kit generate` -> review SQL -> `drizzle-kit migrate` -> re-verify build.

---

# Git & Security Rules

- **Branching**: Features: `feature/{name}` · Bugs: `fix/{name}`. Open a PR for every change.
- **Authentication**: `workspace_id` and `user_id` sourced from `jwt_payload` only — never from request body or query params.
- **Passwords**: Hashed with bcrypt (cost factor ≥ 12).
- **Secrets Management**: Public-safe vars prefixed with `NEXT_PUBLIC_` only. `.env` and `.env.test` are gitignored.
- **Observability**: `apps/api/instrument.ts` must be first import in `index.ts`. Never log passwords, tokens, keys, decrypted payloads.

---

# CI Checklist (Required before merge)

Run these checks and ensure they pass with zero errors/warnings:

```bash
bun run typecheck    # zero TypeScript errors
bun run lint         # zero lint violations
bun test --coverage  # all tests pass
bun run build        # clean production build
```
