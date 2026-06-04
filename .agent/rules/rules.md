---
trigger: always_on
---

# AI AGENT ENFORCED ARCHITECTURE RULES

> See also: [docs/ARCHITECTURE.md](file:///Users/boneconsulting/Developer/oewang/docs/ARCHITECTURE.md) · [docs/ENGINEERING_STANDARDS.md](file:///Users/boneconsulting/Developer/oewang/docs/ENGINEERING_STANDARDS.md)

## Multi-Workspace SaaS — Turborepo — Encrypted REST

---

# System Overview

**Stack:** Turborepo · Next.js (`apps/app`) · ElysiaJS (`apps/api`) · PostgreSQL (Drizzle ORM) · Redis · Custom JWT Auth (HS256)
**Flow:** `apps/app` (Next.js) → Encrypted REST (AES-256-GCM) → `apps/api` (ElysiaJS) → Database

---

# Monorepo Structure

- `apps/app/`: actions/ (REST actions) · app/[locale]/ (Pages) · components/ (UI) · lib/ (utils) · hooks/ · stores/ (Zustand) · middleware.ts (auth/guard)
- `apps/api/`: modules/{feature}/ (layered controller/service/repository) · plugins/ (auth/encryption/rate-limit)
- `packages/`: bucket/ (S3) · constants/ · currencyfreaks/ · database/ (Drizzle) · dictionaries/ (i18n) · email/ · encryption/ (AES) · logger/ · redis/ · types/ (shared typescript contracts) · ui/ (shadcn) · utils/ (TS helpers)

---

# `src/` Directory Rule

`src/` is **forbidden everywhere** with exactly **two exceptions**:
- `packages/ui/src/` — shadcn component library convention
- `packages/bucket/src/` — S3 package structure

---

# Multi-Workspace Rules (CRITICAL)

Every workspace-scoped table MUST have `workspace_id` + `deleted_at`.
All repository queries MUST filter by `workspace_id` and `deleted_at: null`. No cross-workspace joins.
```ts
where: { workspace_id, deleted_at: null }
```
**Forbidden:** hardcoded workspace IDs, super-admin bypass without checks, or skipping workspace checks.

---

# User ↔ Workspace Model (CRITICAL)

- **users table:** `workspace_id` (FK → workspaces.id, active workspace)
- **user_workspaces table:** `{ user_id, workspace_id, role, joined_at }`
- Workspace membership resolved via `user_workspaces` join. Never an array/JSON column on users.
- Roles defined in `packages/constants/roles.ts` only.
- **JWT MUST include:** `{ user_id, workspace_id }`.

---

# apps/app Rules (Frontend)

UI and REST consumer only. No DB access. No business logic.
**`apps/app` CANNOT import `packages/database` in client components.**
See [RULES_APP.md](file:///Users/boneconsulting/Developer/oewang/.agent/rules/RULES_APP.md) for detailed frontend guidelines.

---

# apps/api Rules (Backend)

Only layer allowed to: access DB, contain business logic, enforce isolation.
**Strict Layer Flow:** `Controller → Service → Repository → Database` (No skipping layers)
See [RULES_API.md](file:///Users/boneconsulting/Developer/oewang/.agent/rules/RULES_API.md) for detailed backend guidelines.

---

# packages/ Rules

- **packages/database**: Drizzle ORM + PG. Migrations generated via `drizzle-kit generate`, applied via `drizzle-kit migrate`.
- **packages/types**: Shared contracts (API responses, interfaces, ErrorCode constant). **MUST** define shared types (e.g. `Notification`, `NotificationSetting`) here so frontend never imports from the database package.
- **packages/constants**: Static constants (roles, default category/wallet seeds).
- **packages/ui**: shadcn/ui components (`src/` internally). Imported in frontend components only.
See [RULES_PACKAGES.md](file:///Users/boneconsulting/Developer/oewang/.agent/rules/RULES_PACKAGES.md) for details.

---

# Styling and Design System Rules

Components must implement the styling patterns defined in the style guide:
1. **Design Philosophy**: Minimalist, flat, and typography-focused. Avoid shadows; use borders (`border-border` / `border-[#e6e6e6]`).
2. **Typography pairing**: serif headers (`font-serif`) for titles/metrics; sans (`font-sans text-[12px] uppercase tracking-widest text-muted-foreground`) for labels/metadata.
3. **Preset-Aware Styling**: Never hardcode roundedness or shadows. Use CSS variables: `rounded-(--radius)` and `shadow-(--shadow-sm)`.
4. **Layout grids**: Use Canvas layout primitives (`BaseCanvas`, `CanvasHeader`, `CanvasContent`, `CanvasChart`, `CanvasGrid`).
5. **Interactive UI**: Flat cards and inline row selections in data tables.
