# CLAUDE.md

Guidance for Claude Code working in this repository. `AGENTS.md` is a symlink to this file, so every agent reads the same rules.

## Read first

`docs/` is the specification and the source of truth. Start at [docs/README.md](docs/README.md).

Before writing code, read the doc that owns the area you are touching:

| Touching | Read |
|---|---|
| Anything | [docs/architecture.md](docs/architecture.md), in particular the [decision log](docs/architecture.md#decision-log) |
| A table or a column | [docs/data-model.md](docs/data-model.md) |
| A route | [docs/api/endpoints.md](docs/api/endpoints.md) and [docs/api/conventions.md](docs/api/conventions.md) |
| Rust | [docs/best-practices/rust-api.md](docs/best-practices/rust-api.md) |
| Svelte | [docs/best-practices/svelte-app.md](docs/best-practices/svelte-app.md) |
| Auth, roles, tokens | [docs/security/auth.md](docs/security/auth.md) |
| Anything the model reads or writes | [docs/security/ai-safety.md](docs/security/ai-safety.md) |
| Request or response bodies | [docs/api/encryption.md](docs/api/encryption.md) |

Work is tracked in [docs/backlog.md](docs/backlog.md) as US-xxx stories. Each names the requirement IDs it satisfies. A story is done when every acceptance criterion is checked, not when the code compiles.

## Commands

Everything runs in containers, so results do not depend on the host.

```bash
docker compose -f infra/docker-compose.yml up          # the whole stack
docker compose -f infra/docker-compose.yml build api   # after editing Cargo.toml

# Checks
docker compose -f infra/docker-compose.yml run --rm --no-deps api cargo clippy --all-targets -- -D warnings
docker compose -f infra/docker-compose.yml run --rm --no-deps api cargo test
docker compose -f infra/docker-compose.yml run --rm --no-deps app bun run check
docker compose -f infra/docker-compose.yml run --rm --no-deps ai uv run ruff check .
docker compose -f infra/docker-compose.yml run --rm --no-deps ai uv run pytest
```

The compose project is named `oewang-dev`, not `oewang`. A volume set under the latter already exists on this machine from an earlier project. Do not rename it back, and do not delete that volume.

## The four rules

These are not style preferences. Breaking one is a design error, not a nit.

1. **The API is the only process with a database connection** (D3). `apps/ai` is never given a `DATABASE_URL`. If a Python module needs data, it calls an internal API endpoint.
2. **The AI service performs side effects by calling back into the API** (D4). It holds no storage credentials and no user token. It states who it acts for; the API decides whether that is allowed.
3. **The browser never talks to the API or the AI service** (D5). SvelteKit server routes are the only client. `src/lib/server/` is the only place that reads the cookie or imports `node:crypto`.
4. **Every body on the two service hops is encrypted** with OWE1 (D22), on top of TLS.

## Non-negotiables

- **Money is never a float.** `rust_decimal` in Rust, `Decimal` in Python, a string on the wire, never a JavaScript `number` (D12). Parsing an amount into a float is a bug in any language.
- **The model never does arithmetic** (D27). Every number it states is computed, rounded and formatted by the API. A model's arithmetic error looks exactly like a correct answer.
- **Soft delete only.** No `DELETE` against a workspace-scoped table (OPS-2).
- **Every read filters by `workspace_id` and `deleted_at IS NULL`.** A repository method without both fails review.
- **`workspace_id` comes from JWT claims, never from a body, a query or a path** (AUTH-4).
- **Every mutation writes an audit row inside the same database transaction** (D14, OPS-1).
- **Wallet rows are locked with `SELECT ... FOR UPDATE`, in ascending ID order,** before any balance is read (D13).
- **The component that reads attacker-controlled text has no tools** (D24). Receipt and statement extraction pass an empty tool list. This is the strongest control in the product; do not weaken it for convenience.
- **Never log** a password, a token, a key, a decrypted body, or file contents (OPS-3).

## Layers

```
Rust:    Router -> Auth extractor -> Handler -> Service -> Repository -> PostgreSQL
Svelte:  Route load or form action -> src/lib/server/api.ts -> API
```

- Handlers parse, validate and map to HTTP. Nothing else. A handler longer than about twenty lines usually holds a service's job.
- Services own business rules and are the only layer that opens a database transaction.
- Repositories are the only code importing `sqlx`. They make no decisions and do not log.
- `domain` depends on neither `db` nor Axum, which is what keeps the rules testable without a database.

## Conventions

| Context | Convention |
|---|---|
| Rust files, modules | `snake_case` |
| Database tables and columns | `snake_case`, plural tables |
| Svelte components | `kebab-case.svelte` |
| TypeScript variables | `camelCase` |
| Error codes | `SCREAMING_SNAKE_CASE`, stable, never reused for a new meaning |
| Requirement IDs | `TXN-3`, defined in `docs/prd.md` only |
| Decisions | `D37`, defined in the decision log only |

Every user-facing string resolves through `src/lib/i18n/en.json` (UI-1). No literals in markup.

## Commits

Conventional commits, scoped by app: `feat(api):`, `fix(app):`, `docs:`, `chore(infra):`.

The body should say **why**, not restate the diff. If a commit works around something surprising, name the surprise. End with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Work happens on `development`. Do not commit to `main` directly, and do not push unless asked.

## Keeping docs true

When behaviour changes, update the doc that owns it in the same change. Each feature doc carries an "Update this doc when" list at the top.

A decision that is worth keeping goes in the [decision log](docs/architecture.md#decision-log) with its reasoning, not just its conclusion. A decision that is reversed is marked superseded, never deleted: the reasoning for the path not taken is the part that stops it being proposed again.

New requirement IDs are appended, never renumbered.

## Things that are deliberately absent

Do not add these back without a new PRD. Each was considered and rejected, and the reasoning is in [docs/prd.md](docs/prd.md#non-goals-for-v1) and [docs/security/ai-safety.md](docs/security/ai-safety.md#what-is-deliberately-not-built):

Invoices, debts, budgets, contacts, a document vault, billing and quotas, integrations, an MCP server, OAuth login, notifications, a background worker, web search in chat, external app tools, bulk write tools, embedding-based tool selection, and a second UI locale.
