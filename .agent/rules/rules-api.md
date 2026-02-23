---
trigger: always_on
---

# apps/api Architecture Rules

ElysiaJS backend. Only layer allowed to: access DB · contain business logic · enforce workspace isolation · handle plan gating.

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

```
modules/wallets/
  wallets.controller.ts   → Elysia instance (routes + validation + encrypt response)
  wallets.service.ts      → abstract class with static methods (business logic)
  wallets.repository.ts   → DB queries only, workspace filter enforced
  wallets.dto.ts          → Elysia.t TypeBox schemas (or wallets.model.ts)
  __tests__/
    wallets.service.test.ts
    wallets.repository.test.ts
    wallets.controller.test.ts
    mocks/
      wallets.repository.mock.ts
```

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
import { Elysia } from "elysia";
import { WalletsService } from "./wallets.service";
import { CreateWalletDto, WalletListQuery } from "./wallets.dto";

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

```ts
// ❌ FORBIDDEN — class controller with Context
import type { Context } from 'elysia'

abstract class WalletsController {
  static getAll(context: Context) { ... } // loses type integrity
}

// ❌ FORBIDDEN — passing full context to service
async ({ ...context }) => WalletsService.handle(context) // don't pass full Context
```

**Controller MUST:**

- Be an Elysia instance (not a class bound to `Context`)
- Use method chaining — every `.get()`, `.post()`, `.use()` chained
- Extract only needed values from context via destructuring, pass them to service
- Extract `workspace_id` and `user_id` from `jwt_payload` exclusively — never from body or query
- Validate all input with Elysia.t TypeBox schemas inline or from `.dto.ts`
- Encrypt every response via `encryptPlugin`

**Controller MUST NOT:**

- Contain business logic, plan checks, or data transformation
- Access `packages/database` or call repositories directly
- Pass the entire `Context` object to a service or class method
- Use a traditional class pattern tied to `Context`

---

# Service Rules

Non-request dependent services (no need for HTTP context) MUST use `abstract class` with `static` methods — this avoids unnecessary class allocation.

```ts
// ✅ CORRECT — abstract class with static methods
export abstract class WalletsService {
  static async create(dto: CreateWalletInput, workspace_id: string, user_id: string) {
    await WalletsService.assertPlanLimit(workspace_id)

    const existing = await WalletsRepository.findByName(dto.name, workspace_id)
    if (existing) return buildApiResponse({ success: false, code: ErrorCode.CONFLICT, status: 409, ... })

    const wallet = await WalletsRepository.create({ ...dto, workspace_id })
    await AuditLogsService.log({ workspace_id, user_id, action: 'wallet.created', entity: 'wallet', entity_id: wallet.id, before: null, after: wallet })

    return buildApiResponse({ success: true, code: 'CREATED', data: wallet, status: 201 })
  }

  private static async assertPlanLimit(workspace_id: string) {
    // throws 422 + ErrorCode.PLAN_LIMIT_EXCEEDED if over limit
  }
}
```

**Request-dependent services** (need cookie, session, or HTTP context) MUST be implemented as a named Elysia instance with `.macro()` to ensure type integrity and plugin deduplication:

```ts
// ✅ CORRECT — request-dependent service as named Elysia plugin
export const AuthService = new Elysia({ name: "Auth.Service" }).macro({
  isSignIn: {
    resolve({ cookie, status }) {
      if (!cookie.session.value) return status(401, "Unauthorized");
      return { session: cookie.session.value };
    },
  },
});
```

**Service MUST:**

- Use `abstract class` + `static` when not tied to HTTP context (most services)
- Use named Elysia plugin when it needs HTTP context (auth guards, session)
- Contain all business logic: workspace validation · plan enforcement · orchestration
- Call `AuditLogsService.log()` after every successful mutation
- Enforce plan limits before every quota-gated write
- Use `ErrorCode` from `packages/types` exclusively
- Return `ApiResponse<T>` built via `buildApiResponse` from `packages/utils`

**Service MUST NOT:**

- Import `packages/database` directly
- Accept or reference `Context` (no `ctx`, `set`, `cookie` in non-request services)
- Contain TypeBox validation (belongs in controller)

---

# Repository Rules

**MUST:**

- Be the ONLY layer importing `packages/database`
- Use `static` methods — no class instantiation needed
- Include `workspace_id` filter on EVERY query — no exceptions
- Include `isNull(deleted_at)` filter on EVERY read — no exceptions
- Paginate all list queries — never return unbounded results
- Soft delete only: `set({ deleted_at: new Date() })` — never `db.delete()`

```ts
export abstract class WalletsRepository {
  static async findAll(workspace_id: string, page: number, limit: number) {
    return db
      .select()
      .from(wallets)
      .where(
        and(eq(wallets.workspace_id, workspace_id), isNull(wallets.deleted_at)),
      )
      .limit(limit)
      .offset((page - 1) * limit);
  }
}
```

**MUST NOT:**

- Contain business logic
- Call other repositories (service orchestrates cross-repo calls)
- Import `packages/types` error codes

---

# Model / DTO Rules (Elysia.t)

TypeBox via `Elysia.t` is the **single source of truth** for both type inference and runtime validation. Never declare a separate TypeScript interface or class alongside a TypeBox schema — they will diverge.

```ts
// ✅ CORRECT — TypeBox as single source of truth
import { t, type UnwrapSchema } from "elysia";

export const CreateWalletDto = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  currency: t.String({ pattern: "^[A-Z]{3}$" }),
  balance: t.Optional(t.Number({ minimum: 0 })),
});

// Derive TypeScript type from the schema — never declare separately
export type CreateWalletInput = UnwrapSchema<typeof CreateWalletDto>;

// ❌ FORBIDDEN — separate interface that duplicates the schema
interface CreateWalletInput {
  name: string;
  currency: string;
  balance?: number;
}
```

Group related schemas in a named const object for organization:

```ts
export const WalletModel = {
  create: t.Object({ ... }),
  update: t.Object({ ... }),
  listQuery: t.Object({ page: t.Optional(t.Number()), limit: t.Optional(t.Number()) }),
} as const
```

---

# Plugin Rules

```
plugins/
  auth.ts        → JWT verify → sets jwt_payload on context → 401/403 if invalid
  encryption.ts  → adds encrypt() to context → controllers call on every response
  logger.ts      → request logging (global scope) via packages/logger
  rate-limit.ts  → Redis-backed, applied globally
```

## Plugin Naming (deduplication)

Always give shared plugins a `name` property. Elysia deduplicates by name — named plugins run only once across all instances even when `.use()`-d multiple times:

```ts
// ✅ CORRECT — named plugin deduplicates automatically
export const authPlugin = new Elysia({ name: 'plugin.auth' })
  .derive(({ headers, status }) => {
    const token = headers.authorization?.replace('Bearer ', '')
    if (!token) return status(401, 'Unauthorized')
    const payload = verifyJWT(token)
    if (!payload?.workspace_id) return status(403, 'Forbidden')
    return { jwt_payload: payload }
  })

// ❌ FORBIDDEN — unnamed plugin re-executes on every .use()
export const authPlugin = new Elysia()
  .derive(...)
```

## Plugin Scope

- **Global scope** (`{ as: 'global' }`) — only for plugins that add NO types: `cors`, `logger`, `rate-limit`, `compression`. These apply to all child instances.
- **Explicit / local scope** (default) — for plugins that add types: `authPlugin`, `encryptPlugin`, any business-logic plugin. Consumers must explicitly `.use()` them.

```ts
// logger → global (no types added)
app.use(loggerPlugin, { as: 'global' })

// auth → explicit (adds jwt_payload type to context)
new Elysia().use(authPlugin).get('/protected', ({ jwt_payload }) => ...)
```

Lifecycle hooks (`.onBeforeHandle`, `.onError`) are isolated to their own instance by default. To export a hook to child instances, use `{ as: 'scoped' }`. To export to all instances, use `{ as: 'global' }`.

## Rate Limits

- Authenticated: 300 req/min per `workspace_id`
- Unauthenticated: 30 req/min per IP
- Auth endpoints (`/v1/auth/*`): 10 req/15min per IP
- Returns `429` + `ErrorCode.RATE_LIMIT_EXCEEDED`
- Required headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

# Error Handling

Use `status()` (Elysia's built-in) to throw HTTP errors directly from services or use `buildApiResponse` for structured responses. Never return raw `Error` objects or stack traces.

```ts
import { status } from 'elysia'

// Throw directly (service layer)
if (!user) throw status(404, buildApiResponse({ success: false, code: ErrorCode.NOT_FOUND, ... }))

// Or return structured response
return buildApiResponse({ success: false, code: ErrorCode.CONFLICT, status: 409, ... })
```

All `ErrorCode` values defined in `packages/types/error-codes.ts`. Never inline a new error string.

HTTP status mapping:

```
400 validation · 401 unauthenticated · 403 forbidden · 404 not found
409 conflict · 422 business logic/plan gate · 429 rate limit · 500 server error
```

---

# API Versioning

All routes prefixed `/v1/{resource}`. Version set at mount level in `apps/api/index.ts`:

```ts
import "./instrument"; // Sentry FIRST
import { Elysia } from "elysia";
import { walletsController } from "./modules/wallets/wallets.controller";

new Elysia()
  .use(loggerPlugin) // global — no types
  .use(rateLimitPlugin) // global — no types
  .use(
    new Elysia({ prefix: "/v1" })
      .use(walletsController)
      .use(transactionsController),
    // ... all feature controllers
  )
  .listen(env.PORT);
```

Breaking changes → `/v2/`. Never mutate existing versioned routes.

---

# Auth Module Special Case

Auth module may skip full service/repository for stateless operations (token signing, bcrypt). Rules:

- DB reads/writes (login, register, invite acceptance) MUST use a repository
- `utils.ts` is for pure static helpers: `hashPassword`, `ve
