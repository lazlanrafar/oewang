# Feature: Categories

> See also: [CLAUDE.md](../CLAUDE.md) · [FEAT_TRANSACTIONS.md](./FEAT_TRANSACTIONS.md) · [FEAT_BUDGETS.md](./FEAT_BUDGETS.md)

---

## 🤖 AI Agent: Update This Doc When

- Modifying `packages/database/schema/categories.ts`
- Adding endpoints to `apps/api/modules/categories/categories.controller.ts`
- Changing default category seeds in `packages/constants/default/category.ts`

---

## Purpose

Categories classify transactions as either `income` or `expense`. Every workspace starts with a set of default categories (seeded on workspace creation). Users can create, rename, reorder, and delete custom categories. Categories are also the basis for budget tracking.

---

## Data Model

### `categories` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` (CUID2) | Primary key |
| `workspaceId` | `text` FK → workspaces | Required |
| `name` | `text` | Required |
| `type` | `text` | `income` \| `expense` |
| `sortOrder` | `integer` | Display order. Default `0` |
| `createdAt` | `timestamp` | Auto |
| `updatedAt` | `timestamp` | Auto |
| `deletedAt` | `timestamp` | Soft delete |

---

## API Endpoints

Base path: `/v1/categories`

| Method | Path | Role Required | Description |
|--------|------|--------------|-------------|
| `GET` | `/` | Any authenticated | List all categories for workspace |
| `POST` | `/` | Editor+ | Create a new category |
| `PUT` | `/reorder` | Editor+ | Reorder multiple categories at once |
| `PUT` | `/:id` | Editor+ | Rename or update a category |
| `DELETE` | `/:id` | Editor+ | Soft-delete a category |

**Query params for `GET /`:**
- `type` — `income` | `expense` | (omit for all)
- `search`
- `page`, `limit`

---

## Business Logic

### Default Categories

When a new workspace is created, `WorkspacesService` seeds default categories from `packages/constants/default/category.ts`. These include standard expense types (Food, Transport, Health, etc.) and income types (Salary, Freelance, etc.).

### Category Deletion

Soft-deleting a category does **not** remove it from existing transactions. Transactions keep their `categoryId` — they just reference a soft-deleted category. The service should warn or block if the category has active budget rules.

### Uniqueness

Category names must be unique per workspace **and** per type. The service validates this before insert/update. Duplicate → `409 CONFLICT`.

### Audit & Realtime

Every mutation calls `AuditLogsService.log()` and triggers `RealtimeService.notifyValueChange(workspaceId, "categories")`.

---

## Source Files

| Layer | File |
|-------|------|
| Schema | `packages/database/schema/categories.ts` |
| Controller | `apps/api/modules/categories/categories.controller.ts` |
| Service | `apps/api/modules/categories/categories.service.ts` |
| Repository | `apps/api/modules/categories/categories.repository.ts` |
| Utils | `apps/api/modules/categories/categories.utils.ts` |
| Tests | `apps/api/modules/categories/categories.utils.test.ts` (38 tests) |
| Seeds | `packages/constants/default/category.ts` |
| E2E | `apps/app/e2e/categories.spec.ts` |
