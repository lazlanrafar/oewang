# Implementation Plan

> See also: [CLAUDE.md](../CLAUDE.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md)

This document tracks active and planned work for oewang. Update it as features move from backlog → in-progress → done.

---

## How to Use This Document

1. **Pick a task** from the backlog below
2. **Move it to In-Progress** with your name and start date
3. **Follow the implementation checklist** at the bottom
4. **Move it to Done** with completion date and PR link

---

## Active / In-Progress

| Task | Owner | Started | PR |
|------|-------|---------|-----|
| — | — | — | — |

---

## Backlog

### API Improvements

- [ ] Add pagination cursor support to `transactions` and `notifications` endpoints (currently offset-based)
- [ ] Add bulk-delete endpoint for transactions (soft delete)
- [ ] Add webhook retry mechanism for failed outgoing webhooks
- [ ] Implement idempotency keys for payment endpoints

### Frontend

- [ ] Offline mode / PWA support with service worker
- [ ] Push notification opt-in flow (VAPID)
- [ ] Invoice PDF generation (server-side)

### Infrastructure

- [ ] Add Redis caching layer for CurrencyFreaks exchange rates (currently fetched on every request)
- [ ] Implement database connection pooling metrics
- [ ] Add structured health-check endpoint returning DB + Redis status

### Testing

- [ ] Increase service-layer test coverage to ≥ 80% branch coverage
- [ ] Add repository integration tests for workspace isolation assertions
- [ ] Add E2E tests for invoice flow (create → share → view public link)

---

## Done

| Task | Completed | PR |
|------|-----------|-----|
| Multi-workspace auth with custom JWT (email/password + Google/GitHub OAuth) | — | — |
| AES-256-GCM end-to-end request/response encryption | — | — |
| Redis-backed sliding window rate limiting | — | — |
| AI assistant (OpenAI + Claude + Gemini multi-agent) | — | — |
| Realtime WebSocket workspace pub/sub | — | — |
| Invoice JWT shareable links | — | — |
| Mayar payment gateway integration | — | — |
| Telegram bot integration | — | — |
| 399 unit tests across 12 modules | — | — |
| 115+ Playwright E2E tests | — | — |

---

## Implementation Checklist

When implementing a new feature, follow this order:

### Before Writing Code

```
1. Read target module files (all files in modules/{feature}/)
2. Read relevant schema files in packages/database/schema/
3. Read packages/types/ and packages/constants/ for existing types
4. Check for open PRs on the same module (avoid conflicts)
```

### Implementation Order

```
1. Schema changes (if needed)
   → Edit packages/database/schema/{table}.ts
   → bun run --cwd packages/database drizzle-kit generate
   → Review generated SQL
   → bun run --cwd packages/database drizzle-kit migrate

2. Types (if new shared types needed)
   → Add to packages/types/{domain}.ts
   → Re-export from packages/types/index.ts

3. Repository
   → Create/update {feature}.repository.ts
   → Add workspace_id filter + isNull(deletedAt) on every read
   → Use soft delete only

4. Service
   → Create/update {feature}.service.ts (abstract class + static methods)
   → Call AuditLogsService.log() after every mutation
   → Call RealtimeService.notifyValueChange() after data mutations

5. DTO / Model
   → Define TypeBox schemas in {feature}.dto.ts or {feature}.model.ts
   → Infer TypeScript types from schemas (no duplicate interfaces)

6. Controller
   → Create/update {feature}.controller.ts (Elysia instance)
   → Use method chaining throughout
   → Validate all input with TypeBox schemas
   → Guard mutations with assertCanEditWorkspaceData()
   → Register in apps/api/index.ts

7. Tests
   → {feature}.utils.test.ts for pure utility functions
   → __tests__/  for service / repository / controller tests
```

### After Writing Code

```
bun run typecheck    # zero TS errors
bun run lint         # zero Biome violations
bun run test         # all tests pass
bun run build        # clean build
```

---

## Architecture Decision Records (ADR)

Quick reference for key past decisions:

### ADR-001: Encrypted REST Transport

**Decision:** All API responses are AES-256-GCM encrypted. Clients must decrypt before reading.

**Rationale:** Protects data from interception. Prevents API response inspection in browser DevTools.

**Implementation:** `apps/api/plugins/encryption.ts` + `apps/app/lib/axios.ts` interceptors.

---

### ADR-002: Custom JWT Auth (no third-party IdP)

**Decision:** The API owns authentication entirely. Email/password uses `Bun.password.hash/verify`. Google and GitHub OAuth uses Authorization Code flow via Next.js route handlers. The API mints an HS256 JWT on every successful login.

**Rationale:** The API owns auth entirely. App JWT carries `workspace_id` and `system_role` from the first request. Single auth path simplifies the `authPlugin`.

**Implementation:** `apps/api/modules/auth/auth.controller.ts` → `/login`, `/register`, `/oauth/connect`. `apps/api/plugins/auth.ts` → JWT-only verification.

---

### ADR-003: Abstract Class + Static Methods for Services

**Decision:** Services use `abstract class` with `static` methods instead of instantiated classes.

**Rationale:** Avoids unnecessary object allocation. Makes dependency graph explicit. Services don't need HTTP context (that's the controller's job).

---

### ADR-004: Soft Delete Only

**Decision:** Workspace-scoped records are never hard-deleted. Use `deletedAt` timestamp.

**Rationale:** Enables audit trails, accidental deletion recovery, and billing recalculations. Audit logs reference `entity_id` which must always resolve.

---

### ADR-005: Turborepo Monorepo with Single Root `.env`

**Decision:** Single root `.env` file. All apps receive vars via `turbo.json → globalEnv`.

**Rationale:** Prevents secret drift between apps. One place to configure, one place to audit.
