# oewang

Track daily money without manual spreadsheets.

A personal finance tracker: transactions, wallets, categories, receipts, and an AI assistant that reads and writes the same ledger through chat. This repository is a ground-up rewrite of an earlier implementation; the full specification lives in [docs/](docs/README.md).

## Status

Early. US-001 (scaffolding) is done. The ledger is US-011 to US-022, the assistant US-026 to US-032. Progress is tracked in [docs/backlog.md](docs/backlog.md).

## Architecture

Three apps that speak HTTP. They share no code package.

| App | Stack | Port | Owns |
|---|---|---|---|
| `apps/app` | SvelteKit 3, Svelte 5 runes, Tailwind 4 | 3000 | UI, the session cookie, proxying to the API |
| `apps/api` | Rust, Axum, sqlx | 3002 | Every business rule, all database access, tool execution |
| `apps/ai` | Python 3.13, FastAPI, Anthropic SDK | 3004 | Prompts, the tool loop, streaming, extraction |

Four rules hold the shape together, and they are worth knowing before reading any code:

1. **The API is the only process with a database connection.** The AI service is never given a `DATABASE_URL`.
2. **The AI service performs side effects by calling back into the API.** It holds no storage credentials and no user token.
3. **The browser never talks to the API or the AI service.** SvelteKit server routes are the only client of the API.
4. **Every body on the two service hops is encrypted at the application layer**, on top of TLS.

The reasoning for each is in the [decision log](docs/architecture.md#decision-log).

## Running it

The only prerequisite is Docker. Every toolchain, including Rust, lives in a container.

```bash
cp .env.example .env            # fill in JWT_SECRET and AI_SERVICE_API_KEY
docker compose -f infra/docker-compose.yml up
```

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| API | http://localhost:3002 |
| AI service | http://localhost:3004 |
| MinIO console | http://localhost:9001 (`oewang` / `oewang-dev-secret`) |
| PostgreSQL | `postgres://oewang:oewang@localhost:5432/oewang` |

Source is bind-mounted and all three apps reload on change. A rebuild is only needed when a dependency manifest changes:

```bash
docker compose -f infra/docker-compose.yml build api   # after editing Cargo.toml
```

Generate the two required secrets:

```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -hex 32      # AI_SERVICE_API_KEY
```

## Database

Migrations and the development seed run through the API container, so no local Rust or psql is needed.

```bash
# Apply migrations
docker compose -f infra/docker-compose.yml run --rm api sqlx migrate run --source migrations

# Seed a demo workspace: 2 wallets, 11 categories, 213 transactions, 120 FX rates
docker compose -f infra/docker-compose.yml exec -T postgres \
  psql -U oewang -d oewang -q < apps/api/seeds/dev.sql

# Regenerate offline query data after adding or changing a query! macro
docker compose -f infra/docker-compose.yml run --rm api cargo sqlx prepare --workspace
```

The seed is idempotent and safe to re-run. It logs in as `demo@oewang.local`.

## Checks

Run them in the containers, so the result does not depend on what happens to be installed locally.

```bash
# Rust
docker compose -f infra/docker-compose.yml run --rm --no-deps api cargo check --workspace --all-targets
docker compose -f infra/docker-compose.yml run --rm --no-deps api cargo clippy --all-targets -- -D warnings
docker compose -f infra/docker-compose.yml run --rm --no-deps api cargo test

# Web app
docker compose -f infra/docker-compose.yml run --rm --no-deps app bun run check

# AI service
docker compose -f infra/docker-compose.yml run --rm --no-deps ai uv run ruff check .
docker compose -f infra/docker-compose.yml run --rm --no-deps ai uv run pytest
```

Working on one app natively instead is fine; the toolchains are Rust 1.84+, Bun 1.3+ and uv with Python 3.12+.

## Repository layout

```
apps/
  app/        SvelteKit web app, also the BFF
  api/        Rust cargo workspace: server, domain, db, clients
  ai/         Python AI service
docs/         The specification. Start at docs/README.md
infra/        docker-compose for development
references/   Earlier implementations, read-only, not part of the build
```

## Documentation

`docs/` is the source of truth, for people and for coding agents alike. Start at [docs/README.md](docs/README.md), which carries a reading order and a map.

The two that answer most questions:

- [docs/prd.md](docs/prd.md): what is being built, what is deliberately not, and every requirement ID.
- [docs/architecture.md](docs/architecture.md): how the pieces fit, and why, in a numbered decision log.

House rules for working in this repository are in [CLAUDE.md](CLAUDE.md).
