# Rust API Best Practices

Status: draft v0.1, 2026-11-02. Part of the [oewang docs](../README.md). Applies to `apps/api`.

How code in the API is organized and written. Where a rule exists to serve a requirement, the requirement is named.

## Update this doc when

- Changing the crate layout or the layer flow.
- Adopting or dropping a core dependency.
- Changing the error type, the tenancy pattern, or the transaction pattern.

## Stack

| Concern | Choice |
|---|---|
| HTTP | `axum`, on `tokio` and `hyper` |
| Middleware | `tower-http`: trace, request ID, timeout, body limit, catch-panic, compression |
| Database | `sqlx` with the `postgres`, `macros`, `rust_decimal`, `chrono` and `uuid` features |
| Money | `rust_decimal` ([data model](../data-model.md#conventions)) |
| Time | `chrono` with `Utc` |
| IDs | `cuid2` |
| Serialization | `serde`, `serde_json` |
| Validation | `validator` on request structs |
| Errors | `thiserror` for the domain error enum, no `anyhow` in library crates |
| Hashing | `argon2` |
| JWT | `jsonwebtoken` |
| Crypto | `x25519-dalek`, `ed25519-dalek`, `aes-gcm`, `hkdf`, `sha2`, `rand` ([encryption](../api/encryption.md#primitives)) |
| HTTP client | `reqwest` with `rustls` |
| Streaming | `tokio-stream`, to hand the chat turn's channel to axum as a response body |
| Logging | `tracing`, `tracing-subscriber` with a JSON layer |
| Tests | the built-in harness, plus `sqlx::test` for database tests |

No `unsafe` anywhere. `#![forbid(unsafe_code)]` at the top of every crate.

## Crate layout

```
apps/api/
├─ crates/
│  ├─ server/      binary: router, middleware, extractors, handlers, main()
│  ├─ domain/      types, errors, money, role rules, the OWE1 protocol
│  ├─ db/          pool, repositories
│  └─ clients/     ai-service client, storage trait and implementations
└─ migrations/
```

`domain` depends on neither `db` nor `axum`. That is what makes the business rules unit-testable without a database and without a server. If a rule needs a query to express, the rule belongs in a service and the query belongs in a repository; the rule does not move into `db`.

## Layer flow

```
Router -> middleware -> Auth extractor -> Handler -> Service -> Repository -> PostgreSQL
```

| Layer | Does | Must not |
|---|---|---|
| Handler | Parse, validate, call one service, map to a response | Hold business logic, touch `sqlx`, open a transaction |
| Service | Business rules, orchestration, transactions, audit | Know about HTTP, `axum`, or status codes |
| Repository | SQL, row mapping | Make a decision, call another repository, log |

A handler that is more than about twenty lines usually has a service's job in it.

## Handlers

```rust
pub async fn create_transaction(
    auth: Auth,
    State(state): State<AppState>,
    Json(body): Json<CreateTransactionRequest>,
) -> Result<(StatusCode, Json<Envelope<TransactionResponse>>), AppError> {
    body.validate()?;
    let txn = TransactionService::create(&state.db, auth.workspace_id(), auth.user_id(), body.into()).await?;
    Ok((StatusCode::CREATED, Json(Envelope::data(txn.into()))))
}
```

Rules:

- The `Auth` extractor is the first argument. A handler that does not take it is public, and that is visible at a glance.
- `workspace_id` and `user_id` come from `auth`, never from `body` (AUTH-4).
- Parse, do not validate: the request struct cannot hold an invalid value by the time a service sees it.
- Return `Result<_, AppError>`. No `unwrap`, no `expect`, no `panic!` in a handler.

## Errors

One enum in `domain`, mapped once to the wire format ([conventions](../api/conventions.md#error-catalog)).

```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("wallet not found")]
    WalletNotFound,
    #[error("wallet has transactions")]
    WalletHasTransactions,
    #[error("validation failed")]
    Validation(HashMap<String, String>),
    #[error("internal error")]
    Internal(#[source] anyhow::Error),
    // …
}
```

- Each variant maps to exactly one `code` and one HTTP status, in one `impl IntoResponse`.
- `Internal` is the only variant carrying a source, and the source is logged, never serialized. The client gets the code and the request ID and nothing else (SEC, [hardening](../security/hardening.md#error-handling)).
- A `sqlx::Error` is never returned to a handler as itself. A repository maps `RowNotFound` to the right domain variant; anything else becomes `Internal`.
- `anyhow` is allowed in the binary crate only.

## Database

### Queries

- Always the `query!` family, so `cargo sqlx prepare` checks every query against the real schema at build time. A column rename becomes a compile error.
- Always bound parameters (SEC-9). No `format!` into SQL, including for search: the `LIKE` pattern is a bound parameter.
- Dynamic sort maps an enum to a fixed fragment (SEC-10). There is no other dynamic SQL.
- Every workspace-scoped query carries `workspace_id = $1 AND deleted_at IS NULL`. A repository method without it fails review.

```rust
pub async fn find_by_id(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<Option<Transaction>, sqlx::Error> {
    sqlx::query_as!(
        Transaction,
        r#"SELECT … FROM transactions
           WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL"#,
        id,
        workspace_id,
    )
    .fetch_optional(executor)
    .await
}
```

Every repository method takes `impl PgExecutor<'_>` rather than a pool, so the same method works inside a transaction and outside one. That is what lets a service compose several writes atomically without a second set of methods.

### Transactions

A service opens the transaction. A repository never does.

```rust
let mut tx = pool.begin().await?;

// Lock in a stable order so two opposite transfers cannot deadlock (D13).
let mut ids = vec![wallet_id, to_wallet_id];
ids.sort();
let wallets = WalletRepo::lock_many(&mut *tx, workspace_id, &ids).await?;

let txn = TransactionRepo::insert(&mut *tx, …).await?;
WalletRepo::apply_delta(&mut *tx, …).await?;
AuditRepo::insert(&mut *tx, …).await?;   // same transaction (D14, OPS-1)

tx.commit().await?;
```

Rules:

- Lock every affected wallet with `SELECT … FOR UPDATE` before reading a balance (TXN-6).
- Lock in ascending ID order, always.
- The audit row goes inside the transaction, never after the commit.
- No network call inside an open transaction. Call the AI service before or after, never during.

### Pool

20 connections, 5 second acquire timeout, 10 second statement timeout (SEC-19). Pool exhaustion becomes a fast 503, not a hang.

## Tenancy and authorization

- The `Auth` extractor verifies the JWT and exposes `user_id`, `workspace_id` and `role` ([auth](../security/auth.md)).
- A `RequireRole` extractor gates write routes. It is a type, so a route that forgot it is visible in the router.
- On a write, the service re-reads the membership row rather than trusting the token's role snapshot ([auth](../security/auth.md#the-token)).
- Nothing reads `workspace_id` from a body, a query or a path.

## Money

- `rust_decimal::Decimal` everywhere. Never `f64`, in any struct, including a response struct.
- Serialized as a string through a serde attribute, so the wire format cannot regress by accident (D12).
- A test asserts that a known value round-trips database to JSON to database unchanged.

## Logging

- `tracing` spans per request, carrying `request_id`, `user_id`, `workspace_id`.
- Structured JSON in production, pretty in development.
- Never log a request body, a response body, a token, a secret or file bytes (OPS-3). Secrets live in a newtype whose `Debug` prints `[redacted]`.
- A repository does not log. A service logs a decision; a handler logs nothing.

## Async

- No blocking work on the async runtime. Argon2 hashing and verification run under `spawn_blocking`, because they are CPU-bound by design.
- The statement-import job runs as a spawned task with its own database connection and its own error handling, writing progress to the job row (D10).
- A spawned task never holds a transaction across an await on a network call.

## Testing

| Kind | How |
|---|---|
| Domain unit | Pure functions in `domain`, no database. Balance arithmetic, validation, role rules |
| Repository | `#[sqlx::test]`, which gives each test its own database and rolls back |
| Service | Against a real test database, because the rules are transactional |
| Concurrency | Two tasks creating against one wallet in parallel; the final balance must be exact |
| Handler | `tower::ServiceExt::oneshot` against the router with a test state |
| Protocol | OWE1 vectors shared with the Node and Python implementations ([encryption](../api/encryption.md#implementation-map)) |

Test names read `should_{behaviour}_when_{condition}`, carried over from the old repo's convention.

## Tooling

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo sqlx prepare --check
cargo test
cargo audit
```

All five run in CI on every push (OPS-7, SEC-20). `-D warnings` is not negotiable; a warning that is worth keeping gets an explicit `allow` with a comment.

Release profile: `lto = "thin"`, `codegen-units = 1`, `panic = "abort"`, debug symbols stripped.

## Related docs

- [Docs index](../README.md) and [PRD](../prd.md)
- [Architecture](../architecture.md#rust-crate-layout)
- [Data model](../data-model.md) and [balance arithmetic](../data-model.md#balance-arithmetic)
- [API conventions](../api/conventions.md) and [payload encryption](../api/encryption.md)
- [Auth](../security/auth.md) and [hardening](../security/hardening.md)
- [Svelte app best practices](svelte-app.md)
