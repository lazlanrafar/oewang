# ElysiaJS Best Practices

> See also: [CLAUDE.md](../CLAUDE.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md)

This document captures **oewang-specific** ElysiaJS patterns derived from the actual codebase. These are enforced rules, not suggestions.

---

## Method Chaining — CRITICAL

**Always use method chaining.** Elysia's type system is built on it. Every method returns a new type reference; breaking the chain loses type inference entirely.

```ts
// ✅ CORRECT — chained
export const walletsController = new Elysia()
  .use(authPlugin)
  .use(encryptionPlugin)
  .derive(({ auth }) => ({
    workspaceId: auth?.workspace_id,
    userId: auth?.user_id,
  }))
  .onBeforeHandle(({ auth, set }) => {
    if (!auth) {
      set.status = 401;
      return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
    }
  })
  .group("/wallets", (app) =>
    app.get("/", async ({ workspaceId }) => { ... })
  );

// ❌ FORBIDDEN — broken chain loses all types
const app = new Elysia();
app.use(authPlugin);   // types lost from here
app.get("/", ...);     // workspaceId won't be typed
```

---

## Controller Rules

The controller **IS** the Elysia instance — not a class, not a function wrapping a class.

```ts
// ✅ CORRECT — from apps/api/modules/wallets/wallets.controller.ts
import { Elysia, t } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { WalletsService } from "./wallets.service";
import { createWalletBody } from "./wallets.dto";

export const walletsController = new Elysia()
  .use(authPlugin)             // injects `auth` into context
  .use(encryptionPlugin)       // encrypts all responses
  .derive(({ auth }) => ({     // pull only what you need
    workspaceId: auth?.workspace_id,
    userId: auth?.user_id,
  }))
  .onBeforeHandle(({ auth, set }) => {
    if (!auth) {
      set.status = 401;
      return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
    }
  })
  .group("/wallets", (app) =>
    app
      .get(
        "/",
        async ({ workspaceId, query }) => {
          const data = await WalletsService.getWallets(workspaceId!, query);
          return data; // encryptionPlugin wraps this automatically
        },
        {
          query: t.Object({
            search: t.Optional(t.String()),
            page: t.Optional(t.Numeric({ minimum: 1 })),
            limit: t.Optional(t.Numeric({ minimum: 1, maximum: 250 })),
          }),
          detail: { summary: "Get Wallets", tags: ["Wallets"] },
        },
      )
      .post(
        "/",
        async ({ auth, workspaceId, userId, body, set }) => {
          assertCanEditWorkspaceData(auth?.workspace_role);
          const data = await WalletsService.createWallet(workspaceId!, userId!, body);
          set.status = 201;
          return buildSuccess(data, "Wallet created");
        },
        { body: createWalletBody },
      )
  );
```

**Controller MUST:**
- Be an Elysia instance (not a class bound to `Context`)
- Use method chaining — every `.get()`, `.post()`, `.use()` chained
- Destructure only needed values from context, pass them to service
- Extract `workspace_id` and `user_id` from `auth` (set by `authPlugin`) — **never from body or query**
- Validate all input with TypeBox schemas inline or from `.dto.ts`
- Wrap all groups with `assertCanEditWorkspaceData()` for mutation routes

**Controller MUST NOT:**
- Contain business logic or data transformation
- Import `@workspace/database` or call repositories directly
- Pass the entire `context` object to a service method
- Use a traditional class pattern tied to `Context`

---

## Service Rules

Non-request services use `abstract class` + `static` methods.

```ts
// ✅ CORRECT — from apps/api/modules/wallets/wallets.service.ts
import { status } from "elysia";
import { ErrorCode } from "@workspace/types";
import { buildError, buildPaginatedSuccess } from "@workspace/utils";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { RealtimeService } from "../realtime/realtime.service";
import { WalletsRepository } from "./wallets.repository";

export abstract class WalletsService {
  static async getById(workspaceId: string, id: string) {
    const wallet = await WalletsRepository.findById(workspaceId, id);
    if (!wallet) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Wallet not found"));
    }
    return wallet;
  }

  static async createWallet(
    workspaceId: string,
    userId: string,
    data: { name: string; groupId?: string | null; balance?: string },
  ) {
    const balance = data.balance ? parseFloat(data.balance) : 0;
    const wallet = await WalletsRepository.create({ workspaceId, ...data, balance });

    if (!wallet) {
      throw status(500, buildError(ErrorCode.INTERNAL_ERROR, "Failed to create wallet"));
    }

    // Always log after every successful mutation
    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "wallet.created",
      entity: "wallet",
      entity_id: wallet.id,
      after: wallet,
    });

    RealtimeService.notifyValueChange(workspaceId, "wallets");

    return wallet;
  }
}
```

**Service MUST:**
- Use `abstract class` + `static` for all non-HTTP-context services
- Call `AuditLogsService.log()` after **every** successful mutation
- Use `throw status(httpCode, buildError(...))` for error responses
- Use `ErrorCode` from `@workspace/types` exclusively — never inline error strings
- Call `RealtimeService.notifyValueChange()` after data mutations

**Service MUST NOT:**
- Import `@workspace/database` (only repositories may)
- Accept or reference Elysia `Context` directly
- Contain TypeBox validation (belongs in controller)

---

## Repository Rules

```ts
// ✅ CORRECT — from apps/api/modules/wallets/wallets.repository.ts
import {
  and, asc, db, desc, eq, isNull, sql, wallets,
} from "@workspace/database";

export abstract class WalletsRepository {
  static async findMany(
    workspaceId: string,
    filters?: { search?: string; page?: number; limit?: number },
  ): Promise<{ rows: any[]; total: number }> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;

    const conditions = [
      eq(wallets.workspaceId, workspaceId),   // ← workspace filter REQUIRED
      isNull(wallets.deletedAt),              // ← soft-delete filter REQUIRED
    ];

    const rows = await db
      .select()
      .from(wallets)
      .where(and(...conditions))
      .orderBy(asc(wallets.sortOrder), desc(wallets.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return { rows, total: ... };
  }

  // Soft delete — NEVER use db.delete()
  static async delete(id: string, workspaceId: string) {
    const [wallet] = await db
      .update(wallets)
      .set({ deletedAt: new Date().toISOString() })
      .where(and(eq(wallets.id, id), eq(wallets.workspaceId, workspaceId)))
      .returning();
    return wallet ?? null;
  }
}
```

**Repository MUST:**
- Be the ONLY layer importing `@workspace/database`
- Use `static` methods — no class instantiation
- Include `workspaceId` filter on **every** query — no exceptions
- Include `isNull(deletedAt)` on **every** read — no exceptions
- Paginate all list queries — never return unbounded results
- Soft delete only: `set({ deletedAt: new Date() })` — never `db.delete()`

---

## Plugin Rules

### Named Plugins (deduplication)

Always give shared plugins a `name` property. Elysia deduplicates by name — named plugins run only once across all instances even when `.use()`-d multiple times.

```ts
// ✅ CORRECT — from apps/api/plugins/rate-limit.ts
export const rateLimitPlugin = new Elysia({ name: "rate-limit" })
  .onBeforeHandle(async (ctx) => { ... });

// ✅ CORRECT — from apps/api/plugins/auth.ts
export const authPlugin = new Elysia({ name: "auth" })
  .derive(async ({ headers, cookie }) => { ... })
  .as("scoped"); // scoped: consumers must explicitly .use() it

// ❌ FORBIDDEN — unnamed plugin re-executes on every .use()
export const authPlugin = new Elysia().derive(...);
```

### Plugin Scope

- **`.as("scoped")`** (explicit) — for plugins adding types: `authPlugin`, `encryptionPlugin`. Consumers must explicitly `.use()` them. Types flow to child instances only.
- **Global scope** — only for plugins that add NO types: `cors`, `loggerPlugin`, `staticPlugin`. Applied via `.use(plugin)` on the root `app`.

### encryptionPlugin (special case)

The `encryptionPlugin` (`apps/api/plugins/encryption.ts`) works as a function-style plugin (not a named Elysia instance) to hook into `onTransform` and `mapResponse`:

```ts
// apps/api/plugins/encryption.ts exports a function
export const encryptionPlugin = (app: Elysia) =>
  app
    .onTransform(async ({ request, body }) => {
      // Decrypt request body if x-encrypted header is present
    })
    .mapResponse(({ response }) => {
      // Encrypt all JSON responses
      // Skip: /swagger, /health, /mayar/webhook
    });
```

---

## Error Handling

```ts
// Throw errors from service layer with status + structured body
throw status(404, buildError(ErrorCode.NOT_FOUND, "Wallet not found"));
throw status(500, buildError(ErrorCode.INTERNAL_ERROR, "Failed to create wallet"));

// Return structured error from controller
return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
```

Global `onError` in `apps/api/index.ts` handles:
- `VALIDATION` → 400 + `ErrorCode.VALIDATION_ERROR`
- `NOT_FOUND` → 404 + `ErrorCode.NOT_FOUND`
- Numeric HTTP codes (from `status()`) → pass-through
- DB errors (postgres/drizzle keywords) → 500 + `ErrorCode.DATABASE_ERROR`
- Fallback → 500 + `ErrorCode.INTERNAL_ERROR`

**HTTP status mapping:**
```
400 — validation
401 — unauthenticated
403 — forbidden (workspace role check)
404 — not found
409 — conflict
422 — business logic / plan gate
429 — rate limit exceeded
500 — server / DB error
```

---

## DTOs (TypeBox Schemas)

TypeBox via `Elysia.t` is the single source of truth. Never declare a separate TypeScript interface alongside a TypeBox schema.

```ts
// ✅ CORRECT — from apps/api/modules/wallets/wallets.dto.ts
import { t } from "elysia";

export const createWalletBody = t.Object({
  name: t.String({ minLength: 1 }),
  groupId: t.Optional(t.Union([t.String(), t.Null()])),
  balance: t.Optional(t.String()), // Decimal as string "100.00"
  isIncludedInTotals: t.Optional(t.Boolean()),
});

export const updateWalletBody = t.Object({
  name: t.Optional(t.String({ minLength: 1 })),
  groupId: t.Optional(t.Union([t.String(), t.Null()])),
  balance: t.Optional(t.String()),
  isIncludedInTotals: t.Optional(t.Boolean()),
  sortOrder: t.Optional(t.Integer()),
});
```

**Use `.dto.ts`** for features with complex sub-operations (wallets, vault, settings).
**Use `.model.ts`** for primary DB-mapped resource shapes (categories, transactions).

---

## Route Registration Pattern

All controllers are imported and mounted in `apps/api/index.ts`. Routes are split into groups to help Elysia's type inference:

```ts
const apiControllers1 = new Elysia()
  .use(healthController)
  .use(walletsController)
  .use(transactionsController);
  // ... etc

const app = new Elysia()
  .use(cors(...))
  .use(loggerPlugin)
  .use(authPlugin)
  .use(rateLimitPlugin)
  .use(encryptionPlugin)
  .group("/v1", (app) =>
    app.use(apiControllers1).use(apiControllers2).use(apiControllers3)
  )
  .use(publicPricingController) // public routes outside /v1
  .onError(({ error, code, set }) => { ... })
  .listen(port);
```

---

## WebSocket (Realtime)

The `/v1/realtime` WebSocket is workspace-scoped:

```ts
.ws("/realtime", {
  beforeHandle({ wsAuth, set }) {
    if (!wsAuth) { set.status = 401; return "Unauthorized"; }
  },
  open(ws) {
    ws.subscribe(ws.data.wsAuth.workspaceId); // subscribe to workspace channel
  },
  close(ws) {
    ws.unsubscribe(ws.data.wsAuth.workspaceId);
  },
})
```

`RealtimeService.notifyValueChange(workspaceId, type)` publishes events to all workspace subscribers. Services call this after successful mutations.

---

## Rate Limits

| Scenario | Limit |
|----------|-------|
| Authenticated (per `workspace_id`) | 300 req/min |
| Unauthenticated (per IP) | 30 req/min |
| Auth endpoints `/v1/auth/*` (per IP) | 10 req/15min |

Headers always returned: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

Rate limit errors: `429` + `ErrorCode.RATE_LIMIT_EXCEEDED` (encrypted same as other responses).

Falls back to in-memory `Map` when Redis is unavailable (dev only — never acceptable in production).

---

## Workspace Permission Guard

```ts
// apps/api/modules/workspaces/workspace-permissions.ts
import { assertCanEditWorkspaceData } from "../workspaces/workspace-permissions";

// In controller before every mutation:
assertCanEditWorkspaceData(auth?.workspace_role);
// Throws 403 if role is "member" on sensitive operations
```

Roles defined in `packages/constants/src/roles.ts`. Never use raw strings `"owner"`, `"admin"`, `"member"` inline.

---

## MCP Server

`apps/api/mcp.ts` exports a Model Context Protocol server for AI tool integrations. Mount separately from the main API — does not go through the same auth/encryption pipeline as REST routes.
