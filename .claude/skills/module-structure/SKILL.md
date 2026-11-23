---
name: module-structure
description: >-
  Feature-colocated module folder structure and strict layer boundary skill.
  Enforces colocating all files of a domain feature in one folder (modules/{module}/)
  using explicit {module}.{layer} file naming ({module}.controller, {module}.service,
  {module}.repository, {module}.model, {module}.dto, {module}.test), banning barrel index
  files inside modules, and enforcing one-way Controller -> Service -> Repository data flow.
  Use whenever creating new features, organizing folders, adding API routes, or refactoring modules.
---

# Module Structure & Layering Skill

Enforces feature-colocated module organization (`modules/{module}/{module}.{layer}`) and strict unidirectional layer boundaries across backend and full-stack codebases.

---

## 1. Core Rule: Colocate by Feature, Prefix with `{module}.{layer}`

Group code by **domain feature** (`auth`, `order`, `customer`, `outlet`, `workitem`), never by technical layer at the root (`controllers/`, `services/`, `models/`). Every file inside `modules/{module}/` repeats the module name followed by its layer role:

```text
src/
  index.ts                                  # App entry (ONLY file allowed to be index.ts)
  lib/
    response.ts                             # Shared response envelope helper
    errors.ts                               # Domain ErrorCode catalog
  plugins/
    jwt.plugin.ts                           # Named framework plugin
    auth.plugin.ts                          # Route guards (requireAuth, requireAdmin, requireRole)
  modules/
    order/
      order.dto.ts                          # Plain TypeScript interfaces / domain types (zero runtime code)
      order.model.ts                        # Runtime validation schemas (TypeBox / Zod)
      order.repository.ts                   # Database queries ONLY (sole importer of @repo/database)
      order.service.ts                      # Business logic, transactions, audit logs, events
      order.controller.ts                   # HTTP route definitions, guards, input extraction, response envelope
      customer-order.controller.ts          # Optional secondary controller for a distinct actor surface
      __tests__/
        order.service.test.ts               # Unit tests for service rules
        order.controller.test.ts            # Route/contract tests
```

### Non-Negotiable File Naming Rules
1. **Always `{module}.{layer}.ts`**: Never use generic filenames like `controller.ts`, `service.ts`, `model.ts`, `types.ts`, or `utils.ts` inside a module folder. Repetition ensures instant identification in editor tabs, stack traces, and fuzzy file search (`Cmd+P`).
2. **No Barrel `index.ts` Inside Modules**: Never create `src/modules/{module}/index.ts`. Import the specific layer file directly (`import { OrderService } from "../order/order.service"`). Barrel files cause circular dependencies and bloat bundle trees.
3. **No Grab-Bag `utils/` Inside Modules**: Pure domain helpers belong either on the `Service`, in a specifically named domain helper (`order-pricing.ts`), or in the workspace's shared `@repo/utils` package.

---

## 2. Strict Responsibilities & One-Way Dependency Flow

Dependencies flow strictly in one direction:

```text
Controller  ──▶  Service  ──▶  Repository  ──▶  Database
   │                │
   └──▶  Model      └──▶  DTO
```

| Layer | File | Allowed to Import | Forbidden to Import / Do |
|-------|------|-------------------|--------------------------|
| **DTO** | `{module}.dto.ts` | Shared `@repo/types` | Framework (`elysia`), ORM (`drizzle-orm`), runtime validators |
| **Model** | `{module}.model.ts` | Validator (`TypeBox` / `Zod`), `@repo/constants` | Services, Repositories, Database |
| **Repository** | `{module}.repository.ts` | `@repo/database` (Drizzle/SQL), `{module}.dto.ts` | HTTP status codes, framework `Context`, business decisions, logging |
| **Service** | `{module}.service.ts` | `{module}.repository.ts`, other `*.service.ts`, `{module}.dto.ts`, `errors.ts` | Framework `Context` (`elysia`, `express`, `http.Request`), raw SQL/ORM tables directly (must go through Repository) |
| **Controller** | `{module}.controller.ts` | `{module}.service.ts`, `{module}.model.ts`, `auth.plugin.ts`, `response.ts` | `@repo/database`, `*.repository.ts`, inline SQL, complex business branching |

---

## 3. Layer Implementation Templates (TypeScript / ElysiaJS)

### 1. `{module}.dto.ts` — Pure Types
```typescript
export interface CreateOrderInput {
  organizationId: string;
  customerId: string;
  items: ReadonlyArray<{ productId: string; quantity: number }>;
}
```

### 2. `{module}.model.ts` — Named Validation Schemas
```typescript
import { Elysia, t } from "elysia";

export const orderModel = new Elysia({ name: "order.model" }).model({
  "order.create.body": t.Object({
    customerId: t.String({ minLength: 1 }),
    items: t.Array(
      t.Object({
        productId: t.String({ minLength: 1 }),
        quantity: t.Integer({ minimum: 1 }),
      }),
      { minItems: 1 },
    ),
  }),
});
```

### 3. `{module}.repository.ts` — Data Access Only
```typescript
import { and, eq, isNull } from "drizzle-orm";
import { db, orders } from "@repo/database";
import type { CreateOrderInput } from "./order.dto";

export abstract class OrderRepository {
  static async findById(organizationId: string, orderId: string) {
    const [row] = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.organizationId, organizationId),
          isNull(orders.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }
}
```

### 4. `{module}.service.ts` — Transport-Agnostic Business Logic
```typescript
import { fail } from "../../lib/errors";
import { OrderRepository } from "./order.repository";

export abstract class OrderService {
  static async getById(organizationId: string, orderId: string) {
    const order = await OrderRepository.findById(organizationId, orderId);
    if (!order) {
      throw fail.notFound("order");
    }
    return order;
  }
}
```

### 5. `{module}.controller.ts` — Thin HTTP Adapter
```typescript
import { Elysia, t } from "elysia";
import { authPlugin, requireAuth } from "../../plugins/auth.plugin";
import { respond } from "../../lib/response";
import { orderModel } from "./order.model";
import { OrderService } from "./order.service";

export const orderController = new Elysia({
  name: "controller.order",
  prefix: "/orders",
})
  .use(authPlugin)
  .use(orderModel)
  .guard({ beforeHandle: requireAuth })
  .get(
    "/:id",
    async ({ auth, params }) => {
      const data = await OrderService.getById(auth.organizationId, params.id);
      return respond.ok({ data });
    },
    { params: t.Object({ id: t.String() }) },
  );
```

---

## 4. Cross-Language Mapping of the Same Pattern

When working in Go, Rust, or Python repositories in the same ecosystem, preserve the exact same feature-colocated separation of concerns:

| Layer Role | TypeScript (`apps/api`) | Go (`internal/<module>/`) | Rust (`crates/*` or `src/modules/`) | Python (`app/modules/<module>/`) |
|------------|-------------------------|---------------------------|-------------------------------------|----------------------------------|
| **Types / DTO** | `{module}.dto.ts` | `types.go` | `{module}_dto.rs` / `domain` | `{module}_dto.py` |
| **Validation** | `{module}.model.ts` | `Validate()` in `types.go` | `serde` + domain newtypes | `{module}_model.py` (Pydantic v2) |
| **DB Access** | `{module}.repository.ts` | `db/queries/{module}.sql` (`sqlc`) | `{module}_repository.rs` (`sqlx`) | `{module}_repository.py` |
| **Business Rules** | `{module}.service.ts` | `service.go` | `{module}_service.rs` | `{module}_service.py` |
| **Transport / HTTP** | `{module}.controller.ts` | `http.go` | `{module}_handler.rs` (<=20 lines) | `{module}_router.py` (FastAPI) |
