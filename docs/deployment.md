# Deployment

Status: v0.2, 2026-11-05. Part of the [oewang docs](README.md). Implements [PRD](prd.md) OPS-6, OPS-7, SEC-8, SEC-20 and the deployment half of [D41](architecture.md#decision-log).

Three containers plus PostgreSQL on Coolify, on the existing Hostinger VPS, with files in Cloudflare R2 (D41). Provisioned on 2026-11-05; what exists is under [Production on Coolify](#production-on-coolify). What is still undecided is listed under [Open questions](#open-questions) rather than filled in with a plausible guess.

## Update this doc when

- A service gains or loses an environment variable, or one changes its meaning.
- A route moves between the public and the internal surface.
- The storage backend, the database topology or the proxy in front changes.
- A health check path or its semantics changes.
- An item under [Open questions](#open-questions) is decided. Move it into the body; do not leave both.

## What runs where

| Unit | Image source | Port | Reachable from |
|---|---|---|---|
| `app` | `apps/app`, SvelteKit on `@sveltejs/adapter-node` | 3000 | The internet, through the proxy |
| `api` | `apps/api`, Rust Axum | 3002 | The internet, through the proxy, minus the internal routes below |
| `ai` | `apps/ai`, Python FastAPI on uvicorn | 3004 | The internal network only (OPS-6) |
| `postgres` | PostgreSQL 16 | 5432 | `api` only |
| Cloudflare R2 | managed | 443 | `api` only |

The call graph is fixed by the architecture and the deployment has to preserve it:

- The browser talks to `app` and to nothing else (D5). `app` is the only client of `api`.
- `api` is the only process with a database connection (D3) and the only holder of the R2 credentials.
- `ai` calls back into `api` at `API_INTERNAL_URL` to do anything with data (D4). It holds no database URL, no storage key and no user token.

There is no background worker and no queue (D10). The one asynchronous job, statement import, runs as a tokio task inside `api`, so `api` is stateful across a restart in the sense that an in-flight import is lost. Drain or accept that on deploy.

The dev images (`Dockerfile.dev` in each app) mount source and run watchers.
They are not production images.

`apps/api/Dockerfile` and `apps/ai/Dockerfile` are. Both are multi-stage: the
image that runs holds a binary or a virtual environment, an unprivileged user
and nothing else, so there is no compiler and no package manager for anyone
who reaches the container to use. Both declare a `HEALTHCHECK` against
`/health`, the liveness route, never `/health/ready`.

Two things about the API image are worth knowing before changing it. It
copies `.sqlx`, the committed query cache, which is what lets it compile
without a database; a query added without `cargo sqlx prepare` fails the
build rather than the deployment. And it copies `migrations`, because
`sqlx::migrate!` embeds them at compile time, so they are a build input as
well as something the separate migration step runs.

Image sizes as built on 2026-11-03: `api` 168 MB, `ai` 343 MB.

`apps/app/Dockerfile` is the web app's: `adapter-node`'s server under bun, with a `HEALTHCHECK` against the app's own `/health`.

## Production on Coolify

Coolify project `oewang`, environment `production`. It replaced oewang old on 2026-11-05: the old `app`, `admin`, `api`, `artificial-intelligence` and `worker` applications were deleted, and the old marketing `website` (oewang.com) was kept as it was. A snapshot of the old environment is on the owner's machine, not in the repository.

| Unit | Image | Domain |
|---|---|---|
| `app` | `ghcr.io/lazlanrafar/oewang/app` | app.oewang.com |
| `api` | `ghcr.io/lazlanrafar/oewang/api` | api.oewang.com |
| `ai` | `ghcr.io/lazlanrafar/oewang/ai` | none (OPS-6) |

- **Images.** `.github/workflows/build-and-push.yml` builds each app's production Dockerfile on a push to `main` that touches it, pushes `:<sha>` and `:latest`, then pins the Coolify application to `:<sha>` and deploys. The repository secrets `COOLIFY_BASE_URL`, `COOLIFY_API_TOKEN` and `COOLIFY_{APP,API,AI}_UUID` drive that step. The packages are public, like the repository.
- **Database.** Logical database `oewang_v2` on the shared PostgreSQL 18 instance in the Coolify project `infrastructure`, with the two roles described under [Migrations](#migrations). The old app's `oewang` database is on the same instance and untouched.
- **Signing keys.** Generated on 2026-11-05 on the owner's machine (`~/.config/oewang/prod/`) and mounted into `api` and `ai` as Coolify file storage. That directory is the only copy outside Coolify.
- **Model gateway.** `AI_BASE_URL` points at the self-hosted 9router on the same Docker network.

## Exactly one instance of each service

This is the constraint that decides the whole deployment shape, so it is
stated before anything else: **`api` and `ai` each run as a single instance
with a single worker.** Not for now, not until traffic grows: adding a
second one today breaks the product, quietly and intermittently.

Four pieces of state live in process memory, and each of them is correct
only while one process holds it:

| State | Where | What a second instance does to it |
|---|---|---|
| OWE1 crypto sessions | Both services | A request reaching the instance that did not run the handshake answers `CRYPTO_SESSION_UNKNOWN`. Each client re-handshakes once and retries, so with two instances roughly half of all calls pay a handshake and some fail the retry too |
| Per-turn tool budgets (`TurnStore`) | `api` | A turn's cap is counted against the instance that opened it. A tool call routed elsewhere is refused as a `turn_id` the API never minted (D68) |
| Rate limit windows | `api` | Each instance counts separately, so the effective limit is multiplied by the instance count (OPS-5, SEC-17) |
| In-flight statement imports | `api`, as tokio tasks (D10) | A deploy kills them. The job row stays `pending` and reports stale after ten minutes, and the modal offers a retry, so nothing is lost, but nothing finishes either |

`ai` additionally runs `uvicorn --workers 1` for the same reason: workers are
separate processes and do not share the session store.

What to do instead of scaling out, in order: the API is a Rust process doing
database round trips, so vertical headroom goes a long way; when it genuinely
runs out, the fix is to move crypto sessions and the turn budgets to shared
storage, and that is a decision record, not a configuration change.

A deploy is therefore a brief interruption rather than a rolling handover.
Clients re-handshake on the next call, which is one extra round trip, and an
in-flight chat stream ends with an `AI_UNAVAILABLE` event after the reply so
far has been persisted (CHAT-9).

## Environment variables

Every variable below is read at startup and validated there: a missing or malformed required one stops the process rather than failing at first use. The source of truth is `.env.example` at the repository root, `apps/api/crates/server/src/config.rs` and `apps/ai/app/config.py`. The lists here are derived from those three; nothing is invented.

Values marked **secret** go in Coolify's secret store, not in a plain environment entry, and never in the repository.

### api

| Variable | Required | Notes |
|---|---|---|
| `APP_ENV` | yes | `production`. Several checks below only bite when this is set correctly |
| `API_PORT` | no | Defaults to 3002 |
| `DATABASE_URL` | yes, **secret** | The application role. Owns no DDL rights; see [Migrations](#migrations) |
| `DB_MAX_CONNECTIONS`, `DB_ACQUIRE_TIMEOUT_SECS`, `DB_STATEMENT_TIMEOUT_SECS` | no | Pool shape |
| `JWT_SECRET` | yes, **secret** | Minimum 32 characters. Rotating it invalidates every session |
| `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL` | no | Defaults 15m and 30d |
| `APP_URL` | yes | Public URL of the web app. Used in invite and password reset links |
| `AI_SERVICE_URL` | yes | Internal URL of `ai` |
| `AI_SERVICE_API_KEY` | yes, **secret** | Minimum 32 characters when `APP_ENV=production`. Compared in constant time |
| `AI_REQUEST_TIMEOUT_SECS`, `CHAT_STREAM_TIMEOUT_SECS` | no | Budgets on the `api` to `ai` hop |
| `CHAT_MAX_TOOL_AMOUNT` | no | Blast-radius cap on one chat tool write (SEC-24, D25) |
| `CRYPTO_SIGNING_KEY_FILE` | yes | Path to the mounted PEM. See [Signing keys](#owe1-signing-keys) |
| `AI_SIGNING_PUBLIC_KEYS` | yes | The AI service's pinned public keys, `kid:base64url` pairs, comma separated. A production client with none refuses to start |
| `OWE1_ENABLED` | no | Must be `true` outside development; the config refuses otherwise |
| `STORAGE_BACKEND` | yes | `s3` |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION` | yes | See [Object storage](#object-storage-cloudflare-r2) |
| `S3_ACCESS_KEY_ID` | yes, **secret** | R2 access key id |
| `S3_SECRET_ACCESS_KEY` | yes, **secret** | R2 secret access key |
| `RESEND_API_KEY` | yes, **secret** | Required when `APP_ENV=production`; without it the mailer falls back to the console, which in production means password reset silently does nothing |
| `EMAIL_FROM` | yes | Sender identity on reset and invite mail |
| `FX_API_URL` | no | Defaults to the keyless exchangerate.host endpoint |
| `FX_ACCESS_KEY` | no, **secret** | Only needed on a paid plan. A failed lookup moves the resolution ladder down a step, so this is never load bearing (TXN-22) |
| `FX_REFRESH_INTERVAL` | no | Default 24h |
| `TRUST_PROXY_HEADERS` | yes | **Set this to `true`.** Behind a proxy every request arrives from the proxy, so with it off the rate limiter buckets the whole internet together. With it on, `x-forwarded-for` is read, which is only safe because the proxy is the only thing that can reach the port. Both halves of that sentence have to be true at once |
| `RATE_LIMIT_*`, `UPLOADS_PER_WORKSPACE_PER_DAY`, `REQUEST_TIMEOUT_SECS`, `BODY_LIMIT_BYTES` | no | Limits, documented in [hardening](security/hardening.md#rate-limits-and-resource-limits) |
| `RUST_LOG` | no | Production wants something quieter than the development default, for example `oewang_server=info,warn` |

`STORAGE_LOCAL_PATH` is read but unused when the backend is `s3`.

### ai

Read by `apps/ai/app/config.py` as lowercase settings; the environment names are the uppercase forms below.

| Variable | Required | Notes |
|---|---|---|
| `APP_ENV` | yes | `production` |
| `PORT` | no | Defaults to 3004 |
| `AI_SERVICE_API_KEY` | yes, **secret** | The same value as the API's |
| `API_INTERNAL_URL` | yes | Internal URL of `api` |
| `API_TIMEOUT_SECS` | no | One tool call's ceiling |
| `AI_BASE_URL` | no | Empty calls Anthropic directly; set it to a gateway that speaks the Anthropic protocol to use anything else (D67) |
| `AI_API_KEY` | yes, **secret** | The key for whichever of the two the line above selects |
| `AI_CHAT_MODEL`, `AI_VISION_PRIMARY`, `AI_VISION_SECONDARY`, `AI_VISION_TERTIARY` | no | Model ids as the provider or gateway names them |
| `AI_QUALITY_THRESHOLD`, `AI_EXTRACTION_BUDGET_MS`, `AI_MAX_STEPS`, `AI_MAX_OUTPUT_TOKENS` | no | The extraction ladder and the tool loop |
| `MODEL_TIMEOUT_SECS`, `MODEL_MAX_RETRIES` | no | One model call's ceiling |
| `CRYPTO_SIGNING_KEY_FILE` | yes | This service signs its own handshake, so it holds its own key, a different one from the API's |
| `CRYPTO_SIGNING_PUBLIC_KEYS` | yes | The **API's** pinned public keys. Empty is a development-only path |
| `OWE1_ENABLED` | no | Must be `true` outside development |
| `RATE_LIMIT_PER_MINUTE`, `HANDSHAKE_RATE_LIMIT_PER_MINUTE` | no | Per caller |

**Four variables must not reach this container**: `DATABASE_URL`, `JWT_SECRET`, `S3_SECRET_ACCESS_KEY`, `RESEND_API_KEY`. The service checks for them at startup and refuses to start if one arrives (D3, D4). This is a real constraint on the deployment, not a formality: a Coolify shared-environment entry that applies to a whole project would hand all four to this container and it would not boot. Keep the AI service's environment separate from the API's, or scope the shared entries.

### app

The SvelteKit server reads these from the process environment.

| Variable | Required | Notes |
|---|---|---|
| `APP_ENV` | yes | `production`. Without it, a missing pinned key degrades instead of refusing |
| `PORT` | no | adapter-node, defaults to 3000 |
| `ORIGIN` | yes | The public origin. adapter-node needs it to accept form posts |
| `API_URL` | yes | Internal URL of `api` |
| `CRYPTO_SIGNING_PUBLIC_KEYS` | yes | The API's pinned public keys. `apps/app/src/lib/server/api.ts` throws at startup when `APP_ENV=production` and this is empty |
| `OWE1_ENABLED` | no | Anything other than the string `false` is on |

`OWE1_VECTORS_PATH` is a test-only variable. It does not belong in a deployed environment.

## OWE1 signing keys

Two keys, not one: the API signs hop 2's handshake, the AI service signs hop 3's ([encryption](api/encryption.md#server-signing-keys)).

- Each is an Ed25519 private key, PKCS#8 PEM, file mode `0600`, mounted read-only from Coolify's secret store at the path in that service's `CRYPTO_SIGNING_KEY_FILE`.
- **Never created on first start in production.** `apps/api/crates/server/src/main.rs` passes `allow_create` only when `APP_ENV` is `Development`; outside that the loader fails and the process exits with status 1. This is deliberate: a key generated on a restart would be a new `kid`, every pinned client would reject every handshake, and the failure would look like a transport fault rather than a missing mount. The hard exit turns that into an obvious crash loop.
- Generate once, outside the VPS, and put the PEM in the secret store:

  ```bash
  openssl genpkey -algorithm ed25519 -out owe1-signing-key.pem
  chmod 600 owe1-signing-key.pem
  ```

- The matching public keys are served at `GET /.well-known/oewang-keys` on each service, plaintext, and are pinned by the clients: `CRYPTO_SIGNING_PUBLIC_KEYS` on `app` and on `ai` pins the API's; `AI_SIGNING_PUBLIC_KEYS` on `api` pins the AI service's. Read the `kid` from the running service's well-known endpoint and paste the pair in; do not derive it by hand.
- Rotation: publish the new key, deploy the clients pinning both, switch signing, remove the old key after 90 days ([encryption](api/encryption.md#server-signing-keys)).

Nothing writes a key to disk at runtime, and nothing logs one ([hardening](security/hardening.md#secrets)).

## Migrations

The application role owns no DDL rights in production ([hardening](security/hardening.md#database)). Migrations therefore run as a separate role, before the application pool opens.

Two roles on the same database:

| Role | Rights | Used by |
|---|---|---|
| Migration role (`oewang_migrator`) | Owns the schema, full DDL | `MIGRATION_DATABASE_URL` |
| Application role (`oewang_app`) | `SELECT`, `INSERT`, `UPDATE` on every table, `DELETE` on `telegram_updates` only, `USAGE` on sequences. No `CREATE`, no `DROP`, no `ALTER` | `DATABASE_URL` |

The step: when `MIGRATION_DATABASE_URL` is set, `api` applies its embedded migrations over one connection as that role, closes it, and only then opens the application pool. A migration that fails stops the process, so the old container keeps serving.

Both URLs sit in the `api` container's environment. The split therefore does not protect against someone who controls that container, who holds the data either way. It protects against SQL that reaches the application pool: an injected statement runs as a role that cannot drop or alter anything.

`telegram_updates` is the one table the application deletes from: it is a de-duplication log of Telegram update ids, not workspace data, and its old rows are pruned.

The roles were created once, as `postgres`:

```sql
CREATE ROLE oewang_migrator LOGIN PASSWORD '...';
CREATE ROLE oewang_app LOGIN PASSWORD '...';
CREATE DATABASE oewang_v2 OWNER oewang_migrator;
\c oewang_v2
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO oewang_app;
ALTER DEFAULT PRIVILEGES FOR ROLE oewang_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO oewang_app;
ALTER DEFAULT PRIVILEGES FOR ROLE oewang_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO oewang_app;
```

`DELETE` on `telegram_updates` is granted after the first migration has created the table.

Notes that matter in practice:

- The migrations are in `apps/api/migrations` and are tracked in `_sqlx_migrations`. The runner is idempotent, so a repeated step is a no-op.
- The application role has no `DELETE` grant to lose: nothing in the application issues one against a workspace-scoped table (OPS-2, soft delete only).
- A new table created by a migration is owned by the migration role. The default privileges above grant it to the application role automatically; a table that needs `DELETE` needs its own grant.
- `cargo sqlx prepare --check` in CI guarantees the committed `.sqlx` cache matches the schema the migrations produce, so the binary that ships was compiled against the schema it will run against.

## Object storage: Cloudflare R2

R2 is used through its S3-compatible API. The client in `apps/api/crates/clients/src/storage/s3.rs` is a small SigV4 signer, path style, three signed headers.

| Variable | Value |
|---|---|
| `STORAGE_BACKEND` | `s3` |
| `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | the bucket name |
| `S3_REGION` | `auto`. R2 expects `auto` in the SigV4 credential scope; this is not a placeholder |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | An R2 API token scoped to **object read and write on that one bucket**, nothing wider |

Two consequences of D23 that shape the deployment:

- **No signed object-storage URL exists anywhere.** File bytes travel through the API in encrypted chunks, inside the OWE1 envelope ([encryption](api/encryption.md#file-bytes)). A browser never holds a URL into R2, and R2 is never reached from the internet.
- **The bucket stays private and un-fronted.** No public bucket, no R2 custom domain, no CDN in front of it. The cost is API bandwidth for every download, which was accepted in D23; the benefit is that bytes are never outside the envelope.

The bucket needs no CORS configuration, because no browser request ever reaches it.

## Health checks

| Service | Path | Meaning |
|---|---|---|
| `api` | `GET /health` | Liveness. Static `{"status":"ok"}`, no dependencies touched |
| `api` | `GET /health/ready` | Readiness. Runs `SELECT 1` against the pool. 200 with `{"status":"ok","database":"ok"}`, or 503 with `{"status":"degraded","database":"unavailable"}` |
| `ai` | `GET /health` | Liveness |
| `app` | `GET /health` | Liveness |

Both API health routes answer in plaintext, outside OWE1 (E1): they carry no data and a load balancer holds no crypto session. That is what makes them usable as a container health check.

Use `/health` for the container's liveness probe and `/health/ready` as the gate the proxy uses before sending traffic to a new `api`. Pointing liveness at `/health/ready` would restart the API every time PostgreSQL blinks, which turns a database hiccup into an outage.

## Reverse proxy

Coolify's proxy terminates TLS and is the only thing that may reach a container port. The containers listen on the internal network; no port is published to the host.

| Host | Backend |
|---|---|
| The app domain | `app:3000` |
| The API domain | `api:3002` |

`ai:3004` gets no route at all. It is reachable from `api` over the internal network and from nowhere else (OPS-6). The port published in `infra/docker-compose.yml` is for local debugging and has no counterpart here.

### Must never be routable from the internet

- **`/v1/internal/*` on the API.** Service-to-service only, called by the AI service, gated by `x-api-key` and compared in constant time ([endpoints](api/endpoints.md#internal), OPS-6). The key is a second line, not the first: the first is that the path is not routed. Block it at the proxy, with a 404, and keep the API's own gate as well. Two controls, because either one failing alone should not expose the route.
- **The whole AI service.** Including its `/health`.
- **PostgreSQL and R2.** Neither is reached from a browser in any flow.

Three further proxy requirements:

- **Do not buffer responses.** Chat streams server-sent events through `app` from `api`. A buffering proxy turns a streamed answer into a long pause and then a wall of text.
- **Set `x-forwarded-for` honestly**, and set `TRUST_PROXY_HEADERS=true` on the API so the rate limiter reads it. The header is only trustworthy because nothing else can reach the port; if that ever stops being true, this setting has to come back off.
- **Leave the security headers to the application.** The CSP is issued by SvelteKit with a per-request nonce (`apps/app/vite.config.ts`, SEC-15). A proxy that adds its own `Content-Security-Policy` will fight it and break hydration quietly.

## Deploy order

1. Build and push the three images.
2. Run the migration step as the migration role. It must succeed before anything else moves.
3. Deploy `api`, wait for `/health/ready`.
4. Deploy `ai`.
5. Deploy `app`.

`api` before `ai` because the AI service's client pins the API's signing key and reads nothing from it at startup, but every call it makes needs the API up. `app` last because it is the only thing the user sees, so it should be the last to change.

## Open questions

Each of these needs the repository owner's decision. None of them is a value this document should guess.

- **A private R2 bucket.** Production uses the old app's bucket `oewang` and its access key, because no other key exists yet. That bucket has a public custom domain (`cdn.oewang.com`), which breaks [the rule above](#object-storage-cloudflare-r2): an object's bytes are reachable by anyone who learns its key. The fix is a new bucket with no custom domain and a token scoped to it, created in the Cloudflare dashboard.
- **A second copy of the signing keys.** The only copy outside Coolify is on the owner's laptop. A password manager entry would survive losing it.
- **Database backup and restore.** Nothing in the repository covers backup schedule, retention or a tested restore. A finance app without a tested restore is an open risk, not a detail.
- **`bun audit` is gated at `--audit-level=high` in CI**, not at any advisory. [Hardening](security/hardening.md#dependencies) says a known vulnerability fails the build. Today the tree carries one low-severity advisory, `GHSA-gcqx-w48m-w2h4` in `deepmerge`, reached through `@sveltejs/vite-plugin-svelte`, a build-time dependency. Either the threshold stays and hardening is amended to say so, or the threshold comes off and that advisory gets resolved first.
- **`cargo audit` ignores RUSTSEC-2023-0071** (Marvin attack, `rsa` 0.9.10, medium, no fixed upgrade available). The crate reaches `Cargo.lock` only through `sqlx-mysql`, which `sqlx-macros-core` lists unconditionally; `cargo tree -i rsa` finds nothing, so it is never compiled and no MySQL driver runs. The ignore is written into `.github/workflows/ci.yml` with its reason. It should come off when sqlx drops the dependency or upstream ships a fix.
- **Log destination and retention.** The API emits structured JSON in production. Nothing says where it goes or how long it is kept, and [hardening](security/hardening.md#logging) sets rules about what must never appear in it.

## Related docs

- [Architecture](architecture.md) for the three apps, the configuration table and D41.
- [Hardening](security/hardening.md) for secrets, dependencies and the database roles.
- [Payload encryption](api/encryption.md) for the signing keys and for why file bytes go through the API.
- [API endpoints](api/endpoints.md) for the internal route surface.
- [Backlog](backlog.md), story US-038.
