---
name: feature-planning
description: >-
  Vertical-slice technical implementation planning skill. Turns an approved PRD or feature request
  into a deterministic, file-by-file execution plan covering Database, Repository, Service, Controller,
  Typed Client/Actions, Atomic UI components, Tests, and Living Docs. Requires explicit user approval
  before executing code changes. Use when planning multi-file features, refactors, or sprint stories.
---

# Feature Planning & Vertical-Slice Execution Skill

Translates an approved PRD or feature specification into a **zero-ambiguity, file-by-file implementation plan** so neither human engineers nor AI agents have to guess filenames, type signatures, error codes, or verification steps.

> **Prerequisite**: If requirements, user flows, permissions, or edge cases are still ambiguous, run [`prd-discovery`](../prd-discovery/SKILL.md) first to interview the user before generating the technical plan.
> **Boekti Flow & Wiki Rules**: See [`../prd-discovery/reference.md`](../prd-discovery/reference.md) for ticket branch naming (`<PROJECT>-<n>-short-slug`), wiki updates (`save_page` + Decision Log), file claims, and `boekti e2e` completion evidence.

---

## 1. Core Planning Principles

1. **Zero Open Decisions in the Plan**:
   - Never write vague steps like *"Add backend validation"* or *"Update the UI"*.
   - Every task must name the **exact file paths**, **function/method signatures**, **model/schema names**, **error codes**, and **test files** that prove the task is complete.
2. **Follow Codebase Architecture Skills**:
   - Backend modules must follow [`module-structure`](../../typescript-developer/skills/module-structure/SKILL.md) (`modules/{module}/{module}.{dto|model|repository|service|controller}.ts`, no barrel `index.ts`).
   - UI components must follow [`atomic-design`](../../typescript-developer/skills/atomic-design/SKILL.md) (`components/{atoms,molecules,organisms}/{module}/{module}-{name}`, zero call-site restyling).
3. **Right-Sized, Independently Testable Tasks**:
   - Break work into vertical or layered slices where each task ends with a runnable check (`typecheck`, unit test, or integration test).
   - Fold boilerplate/scaffolding into the task that uses it; split large multi-subsystem specs into separate focused plans.
4. **Mandatory Approval Gate**:
   - Present the completed plan (or write it to an artifact / `docs/plans/` file) and **wait for explicit user approval** before executing implementation steps.

---

## 2. Standard Implementation Plan Structure

Structure every feature implementation plan with these exact sections:

```markdown
# Implementation Plan: <Feature Name>

> Spec Reference: [`docs/FEAT_<NAME>.md`](../FEAT_<NAME>.md) · Requirement IDs: `<MOD>-1` .. `<MOD>-N`

## 1. Blast Radius & File Map

| Layer | Action (`NEW` / `MOD`) | Exact File Path | Responsibility |
|-------|------------------------|-----------------|----------------|
| **Database** | `MOD` | `packages/database/src/schema/<module>.ts` | Table definition, CUID2 PK, indexes |
| **Shared Types** | `MOD` | `packages/types/src/<module>.ts` | Shared DTOs, `ErrorCode` additions |
| **Backend DTO** | `NEW` | `apps/api/src/modules/<module>/<module>.dto.ts` | Pure service/repo interfaces |
| **Backend Model** | `NEW` | `apps/api/src/modules/<module>/<module>.model.ts` | TypeBox/Zod schemas (`<module>.<action>.<slot>`) |
| **Repository** | `NEW` | `apps/api/src/modules/<module>/<module>.repository.ts` | Drizzle/SQL queries (`organization_id` + `deleted_at IS NULL`) |
| **Service** | `NEW` | `apps/api/src/modules/<module>/<module>.service.ts` | Business rules, tx, relative balance update, audit log |
| **Controller** | `NEW` | `apps/api/src/modules/<module>/<module>.controller.ts` | Routes, auth guards, `respond()` envelope |
| **Server Actions** | `NEW` | `packages/actions/src/<module>.actions.ts` | BFF wrappers over `@repo/api-client` |
| **UI Molecules** | `NEW` | `apps/app/src/components/molecules/select-<entity>.tsx` | Reusable searchable entity combobox |
| **UI Organisms** | `NEW` | `apps/app/src/components/organisms/<module>/<module>-data-table.tsx` | Feature table & action dialogs |
| **Tests** | `NEW` | `apps/api/src/modules/<module>/__tests__/<module>.service.test.ts` | Unit & edge-case tests |
| **Living Docs** | `MOD` | `docs/FEAT_<NAME>.md` | Sync schema, endpoints, and UI routes |

---

## 2. Step-by-Step Execution Tasks

### Task 1: Database Schema & Shared Types (`<MOD>-1`)
- [ ] **1.1** Add table/columns in `packages/database/src/schema/<module>.ts` (enforce `organization_id`, `deleted_at`, CUID2 keys, `numeric` for money).
- [ ] **1.2** Add partial index `(organization_id, created_at DESC) WHERE deleted_at IS NULL` and RLS policy if applicable.
- [ ] **1.3** Export shared domain types and `ErrorCode` constants in `packages/types/src/<module>.ts`.
- [ ] **1.4** Verify: `bun run typecheck` in `packages/database` and `packages/types`.

### Task 2: Repository & Service Layer (`<MOD>-2`, `<MOD>-3`)
- [ ] **2.1** Write failing unit/integration tests in `apps/api/src/modules/<module>/__tests__/<module>.service.test.ts` covering happy path, tenant isolation, idempotency, and error cases.
- [ ] **2.2** Implement `<Module>Repository` in `<module>.repository.ts` (strictly scoped by `organizationId` and `isNull(deletedAt)`).
- [ ] **2.3** Implement `<Module>Service` in `<module>.service.ts` (atomic `db.transaction`, relative balance/state guard, audit log insert).
- [ ] **2.4** Verify: run isolated test `bun test ./src/modules/<module>/__tests__/<module>.service.test.ts`.

### Task 3: Model, Controller & API Registration (`<MOD>-4`)
- [ ] **3.1** Define named validation schemas in `<module>.model.ts`.
- [ ] **3.2** Implement `<module>Controller` in `<module>.controller.ts` with `requireAuth` / `requireRole` guard and `respond()` envelope.
- [ ] **3.3** Mount `<module>Controller` in `apps/api/src/index.ts` and verify Eden Treaty type inference in `packages/api-client`.
- [ ] **3.4** Verify: run controller tests + `bun run lint && bun run typecheck`.

### Task 4: Frontend Actions & Atomic UI Components (`<MOD>-5`)
- [ ] **4.1** Create server actions in `packages/actions/src/<module>.actions.ts`.
- [ ] **4.2** Build/reuse Atomic Design components (`atoms`, `molecules/select-<entity>`, `organisms/<module>/<module>-*`) with zero call-site style overrides and `tabular-nums` for numbers.
- [ ] **4.3** Wire route view with URL query state (`nuqs` / `url-state.ts`) and both empty states (*"None created yet"* vs. *"No items match your filters"*).
- [ ] **4.4** Verify: `bun run typecheck`, `bun run lint`, and component/E2E tests.

### Task 5: Living Documentation, Boekti E2E Evidence & Final Gate
- [ ] **5.1** Update the owning Boekti wiki page via MCP `save_page` + Decision Log row (`D<xx>`), or update `docs/FEAT_<NAME>.md` (and `DESIGN.md` if any design token or shared atom changed).
- [ ] **5.2** Run full workspace quality gate (`bun run ci` / `verify-*.sh` / local E2E suite).
- [ ] **5.3** When working on a Boekti ticket (`<PROJECT>-<n>`): upload E2E report and screenshots via `boekti e2e --item <PROJECT>-<n> --report <file> --evidence <dir>`, update status with `update_items`, and post a concise summary with `add_comment`.
```

---

## 3. Pre-Flight Checklist Before Presenting the Plan

Before handing the plan to the user, verify:
1. **Every requirement ID (`<MOD>-1..N`) from the PRD maps to at least one task and one test.**
2. **No unresolved `TODO` or `"decide later"` placeholders exist in the plan.** If a question surfaced while mapping files, stop and ask the user immediately.
3. **Every data mutation specifies its authorization check, tenant filter, concurrency/idempotency guard, and audit log behavior.**
