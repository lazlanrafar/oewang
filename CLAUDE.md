# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Root (run from repo root)

```bash
bun run dev           # Start all apps in parallel via Turborepo
bun run build         # Build all apps
bun run lint          # Run Biome linting across all workspaces
bun run typecheck     # Type-check all workspaces
bun run format        # Prettier format (TS, TSX, MD)

# Database
bun run db:push       # Push schema changes (no migration files)
bun run db:seed       # Seed the database
bun run db:reset      # Reset + push + seed

# MCP server
bun run mcp           # Run the MCP server from apps/api/mcp.ts
```

### Per-app (run from app directory or via --cwd)

```bash
# apps/api
bun run dev           # ElysiaJS dev server with --watch
bun test              # Bun test runner

# apps/app
bun run dev           # Next.js dev (Turbopack)
bun run check:fix     # Biome check + autofix
bun run test:e2e      # Playwright E2E tests
bun run test:e2e:ui   # Playwright with UI mode
```

### Local infrastructure

```bash
docker compose up -d  # Start PostgreSQL 16 (5432) and Redis 7 (6379)
```

## Architecture

This is a **Turborepo monorepo** using **Bun** as package manager and runtime.

### Apps

| App | Framework | Port | Purpose |
|-----|-----------|------|---------|
| `apps/app` | Next.js 16 (Turbopack) | 3000 | Main SaaS application |
| `apps/admin` | Next.js | 3001 | Admin dashboard |
| `apps/api` | ElysiaJS (Bun) | 3002 | REST API + MCP server |
| `apps/website` | Next.js | 3003 | Marketing website |
| `apps/native` | Flutter | — | Mobile app (Dart/Flutter 3.11+) |

### Key packages

- **`packages/database`** — Drizzle ORM + PostgreSQL. Schema lives here (33 tables); all DB access goes through this package. Primary keys use CUID2 (`@paralleldrive/cuid2`).
- **`packages/modules`** — Server actions and data-fetching logic (24 action modules). Next.js `app/` calls into these rather than hitting the API or DB directly.
- **`packages/ai`** — AI service abstractions over OpenAI, Anthropic Claude, and Google Generative AI. Includes agent, memory, artifact, and store tooling.
- **`packages/integrations`** — 40+ third-party integrations (Slack, Gmail, WhatsApp, Stripe, QuickBooks, Xero, etc.).
- **`packages/ui`** — Shared React components built on Shadcn + Radix UI + Tailwind CSS v4.
- **`packages/supabase`** — Supabase clients (server, client, middleware) for auth and realtime.
- **`packages/types`** — Central TypeScript type definitions shared across workspaces.

### Data flow

```
Next.js pages/components
  → packages/modules (server actions)
    → packages/database (Drizzle queries)
      → PostgreSQL (Supabase transaction pooler)

Next.js pages/components
  → apps/api (ElysiaJS REST endpoints)
    → packages/database / packages/integrations / packages/ai
```

### Environment variables

All env vars are defined in a single root `.env` file and surfaced to workspaces via `turbo.json` → `globalEnv`. **Do not create `.env` files inside `apps/*` or `packages/*`.**

## Coding standards (from `docs/rules.md`)

### Naming

| Context | Convention |
|---------|-----------|
| Local variables, data objects, DB fields | `snake_case` |
| React props and interface keys | `camelCase` |
| Files and directories | `kebab-case` |
| React components | `PascalCase` |

### Typing

- Prefer `type` over `interface` for data models and state.
- Always add explicit return types to exported functions and API handlers.
- No `any` — use `unknown` or a concrete type. Use Zod at validation boundaries.

### Logging

Always use `@workspace/logger` (Pino-based), never `console.log` in shared code.

```typescript
import { createLogger } from "@workspace/logger";
const log = createLogger("my-module");
log.info("Processing", { user_id });
```

### Linter

Biome (`@biomejs/biome`) handles both linting and formatting (2-space indent, 80-char line width). Run `bun run lint` or `biome check --write` before committing.
