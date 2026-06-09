---
trigger: always_on
---

# apps/api Architecture Rules

ElysiaJS backend. Only layer allowed to: access DB · contain business logic · enforce workspace isolation · handle plan gating.

> See also: [docs/BEST_PRACTICE_ELYSIA.md](file:///Users/boneconsulting/Developer/oewang/docs/BEST_PRACTICE_ELYSIA.md) · [docs/ARCHITECTURE.md](file:///Users/boneconsulting/Developer/oewang/docs/ARCHITECTURE.md)

---

# Layer Flow

```
Request → Plugin (auth, rate-limit) → Controller → Service → Repository → Database
```

No layer may skip another. No layer may reach down two levels.

---

# Method Chaining — CRITICAL

**Always use method chaining.** Elysia's type system depends on it. Every method returns a new type reference. Breaking the chain loses type inference entirely.

```ts
// ✅ CORRECT — chained
new Elysia({ prefix: '/wallets' })
  .use(authPlugin)
  .get('/', ({ jwt_payload }) => ...)
  .post('/', ({ body, jwt_payload }) => ...)

// ❌ FORBIDDEN — broken chain loses all types
const app = new Elysia()
app.use(authPlugin)    // types lost
app.get('/', ...)      // jwt_payload won't be typed
```

---

# Module Structure

Every feature in `apps/api/modules/{feature}/`:

- `wallets.controller.ts` → Elysia instance (routes + validation + encrypt response)
- `wallets.service.ts` → abstract class with static methods (business logic)
- `wallets.repository.ts` → DB queries only, workspace filter enforced
- `wallets.dto.ts` → Elysia.t TypeBox schemas (or wallets.model.ts)
- `__tests__/` → service, repository, and controller tests + mocks

**No `index.ts` inside `modules/{feature}/`.** Controllers imported directly in `apps/api/index.ts`.

**`.model.ts` vs `.dto.ts`:**

- `.model.ts` — primary DB-mapped resource shape (categories, users, transactions, workspaces)
- `.dto.ts` — request/response transfer objects for complex sub-operations (vault, wallets, settings)

**Sub-module pattern** (`wallets/groups/`, `wallets/items/`, `settings/sub-currencies/`):

- Sub-directory inside parent module, same layered structure
- Sub-module controllers mounted directly in parent controller — no `index.ts` in sub-dirs

---

# Controller Rules

The controller IS the Elysia instance. One Elysia instance = one controller.

```ts
// ✅ CORRECT — Elysia instance as controller
export const walletsController = new Elysia({ prefix: "/wallets" })
  .use(authPlugin) // injects jwt_payload into context
  .use(encryptPlugin) // injects encrypt() into context
  .get(
    "/",
    async ({ jwt_payload, query, encrypt }) => {
      const result = await WalletsService.getAll(
        jwt_payload.workspace_id,
        query,
      );
      return encrypt(result);
    },
    { query: WalletListQuery },
  )
  .post(
    "/",
    async ({ body, jwt_payload, encrypt }) => {
      const result = await WalletsService.create(
        body,
        jwt_payload.workspace_id,
        jwt_payload.user_id,
      );
      return encrypt(result);
    },
    { body: CreateWalletDto },
  );
```

**Controller MUST:**

- Be an Elysia instance (not a class bound to `Context`)
- Use method chaining strictly
- Extract only needed values from context via destructuring, pass them to service
- Extract `workspace_id` and `user_id` from `jwt_payload` exclusively — never from body or query
- Validate all input with Elysia.t TypeBox schemas inline or from `.dto.ts`
- Encrypt every response via `encryptPlugin`

**Controller MUST NOT:**

- Contain business logic, plan checks, or data transformation
- Access `packages/database` or call repositories directly
- Pass the entire `Context` object to a service or class method

---

# Service Rules

Non-request dependent services MUST use `abstract class` with `static` methods to avoid allocation.

```ts
// ✅ CORRECT — abstract class with static methods
export abstract class WalletsService {
  static async create(
    dto: CreateWalletInput,
    workspace_id: string,
    user_id: string,
  ) {
    await WalletsService.assertPlanLimit(workspace_id);
    const existing = await WalletsRepository.findByName(dto.name, workspace_id);
    if (existing)
      return buildApiResponse({
        success: false,
        code: ErrorCode.CONFLICT,
        status: 409,
      });
    const wallet = await WalletsRepository.create({ ...dto, workspace_id });
    await AuditLogsService.log({
      workspace_id,
      user_id,
      action: "wallet.created",
      entity: "wallet",
      entity_id: wallet.id,
      before: null,
      after: wallet,
    });
    return buildApiResponse({
      success: true,
      code: "CREATED",
      data: wallet,
      status: 201,
    });
  }
}
```

Request-dependent services (cookies/sessions) MUST be a named Elysia instance with `.macro()`.

**Service MUST:**

- Use `abstract class` + `static` when not tied to HTTP context
- Contain all business logic: workspace validation, plan limits, orchestration
- Call `AuditLogsService.log()` after every successful mutation
- Enforce plan limits before every quota-gated write
- Return `ApiResponse<T>` built via `buildApiResponse` from `packages/utils`

**Service MUST NOT:**

- Import `@workspace/database` or `packages/database` directly
- Run transactions using `db.transaction(...)` directly; delegate transaction blocks to `Repository.runTransaction(...)` helpers
- Accept or reference `Context` (no `ctx`, `set`, `cookie` in static services)

---

# Repository Rules

**MUST:**

- Be the ONLY layer importing `packages/database`
- Use `static` methods
- Include `workspace_id` filter and `isNull(deleted_at)` filter on EVERY query — no exceptions
- Paginate all list queries
- Soft delete only: `set({ deleted_at: new Date() })`
- Implement static `runTransaction` helper when transaction scopes are required:
  ```ts
  static async runTransaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    return db.transaction(callback);
  }
  ```

**MUST NOT:**

- Contain business logic
- Call other repositories (service orchestrates cross-repo calls)
- Import `packages/types` error codes

---

# Model / DTO Rules (Elysia.t)

TypeBox via `Elysia.t` is the **single source of truth** for type inference and validation. Never declare a separate TypeScript interface alongside a TypeBox schema.

```ts
// ✅ CORRECT — TypeBox as single source of truth
import { t, type UnwrapSchema } from "elysia";
export const CreateWalletDto = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  currency: t.String({ pattern: "^[A-Z]{3}$" }),
  balance: t.Optional(t.Number({ minimum: 0 })),
});
export type CreateWalletInput = UnwrapSchema<typeof CreateWalletDto>;
```

---

# Plugin Rules

- **authPlugin**: Derives `jwt_payload` from token. Named plugin for deduplication.
- **encryptionPlugin**: Encrypts responses. Scoped to controller.
- **logger/rate-limit**: Global scope `{ as: 'global' }`.

Always give shared plugins a `name` property. Elysia deduplicates by name, running them once.

**Rate Limits:**

- Authenticated: 300 req/min per `workspace_id`
- Unauthenticated: 30 req/min per IP
- Auth endpoints (`/v1/auth/*`): 10 req/15min per IP
- Returns `429` + `ErrorCode.RATE_LIMIT_EXCEEDED`

---

# Error Handling

Use `status()` to throw HTTP errors directly from services or use `buildApiResponse` for structured responses. Never return raw `Error` objects or stack traces.
All `ErrorCode` values defined in `packages/types/error-codes.ts`.

HTTP status mapping:

- `400` validation · `401` unauthenticated · `403` forbidden · `404` not found
- `409` conflict · `422` business logic/plan gate · `429` rate limit · `500` server error

---

# Auth Module Special Case

Auth module may skip full service/repository for stateless operations (token signing, bcrypt). DB reads/writes (login, register, invite acceptance) MUST use a repository.
