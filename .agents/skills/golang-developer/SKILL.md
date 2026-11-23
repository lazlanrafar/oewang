---
name: golang-developer
description: >-
  Go backend engineering skill based on roadmap.sh/golang and production Go 1.24+/1.27 architecture.
  Enforces cmd/ + internal/<feature>/ layout, thin httpx handlers, chi/v5, pgx/v5 + sqlc + goose,
  tenant-scoped transactions with RLS, cataloged apperr codes, stdlib AEAD crypto, MCP server tool parity,
  and race-checked testcontainers integration tests. Use when writing, reviewing, or debugging Go code.
---

# Go Developer Skill

Engineering guidelines for production Go services based on `roadmap.sh/golang`, Effective Go, and the Boekti Go architecture (`chi/v5`, `pgx/v5`, `sqlc`, `goose`, `modelcontextprotocol/go-sdk`).

---

## 1. Project Layout & Package Boundaries

```text
cmd/
  api/main.go             # Wires config, DB pool, router, jobs, and graceful shutdown
internal/
  <feature>/
    http.go               # Thin HTTP handlers (decode -> validate -> call service -> write envelope)
    service.go            # Business logic, authz, DB transactions, audit/activity/job enqueue
    types.go              # Feature domain structs and input Validate() methods
  apperr/                 # Centralized error catalog (codes, titles, messages, HTTP mapping)
  authz/                  # Permission catalog and Require() checks
  db/                     # pgxpool, tenant-scoped Tx helper, goose runner, sqlc queries
  httpx/                  # Handler wrapper, standard {data, error, meta} JSON envelope
```

- **No `util` or `common` Packages**: Name packages after what they provide (`httpx`, `apperr`, `redact`, `ratelimit`, `safefetch`).
- **Accept Interfaces, Return Structs**: Define small consumer-side interfaces where needed; return concrete structs from constructors.

---

## 2. HTTP Layer, Validation & Error Catalog

1. **Thin Handlers & Uniform Envelope**:
   - Handlers decode input, call `input.Validate()`, invoke the service method, and write the response envelope `{ "data": ..., "error": ..., "meta": ... }` via `httpx.Write`.
   - **MCP Tool Parity**: MCP tools (`internal/mcp`) must call the **exact same service methods** as HTTP handlers — never duplicate business logic or authorization in transport adapters.
2. **Input Validation with JSON Pointers**:
   - Implement `Validate()` on request structs to collect all field errors with RFC 6901 JSON Pointers (`/email`, `/items/0/quantity`) in a single pass.
3. **Cataloged Domain Errors (`internal/apperr`)**:
   - Never return raw Go, SQL, or third-party library error strings to clients.
   - Map PostgreSQL errors by constraint name (`pgconn.PgError`) into cataloged `apperr` codes.
   - Always inspect errors with `errors.Is` and `errors.As`, and wrap internal context with `fmt.Errorf("doing x: %w", err)`.

---

## 3. Database (`pgx/v5` + `sqlc` + `goose`) & Multi-Tenancy

1. **Type-Safe SQL with `sqlc`, Not Heavy Reflection ORMs**:
   - Author explicit SQL in `db/queries/*.sql` and generate type-safe Go code via `go tool sqlc generate`.
   - Manage schema migrations with `goose` in `db/migrations/`.
2. **Service Signature & Tenant Transactions**:
   - Standard service signature: `func (s *Service) Action(ctx context.Context, principal Principal, organizationID id.ID, in Input) (Output, error)`.
   - **Authorize First**: Verify permissions (`authz.Require(principal, Perm...)` — check permissions, never hardcode role names) before mutating state.
   - **Tenant-Scoped `db.Tx`**: Every transaction sets `SET LOCAL app.organization_id = ...` for forced PostgreSQL RLS, and every query explicitly includes `organization_id`.
   - **Atomic Audit & Background Jobs**: Write activity rows, audit hash-chain entries, notifications, and River queue jobs **inside the same `db.Tx`** as the domain change.
3. **Prefixed CUID2 Identifiers**:
   - Use prefixed CUID2 strings (`wi_tz4a98xx...`) across DB, API, logs, and MCP. Never sort by ID alone; always sort by `(created_at, id)`.

---

## 4. Concurrency, Context & Resource Lifecycle

- **Always propagate `ctx context.Context`** as the first parameter of every I/O or service function.
- **No Fire-and-Forget Goroutines**: Every background goroutine must have a bounded lifetime tied to `errgroup.WithContext(ctx)` or a tracked worker lifecycle with graceful shutdown on `SIGTERM`.
- **Prevent Goroutine Leaks**: Always set timeouts on `http.Client`, close response bodies (`defer resp.Body.Close()`), and drain or cancel channels via `select { case <-ctx.Done(): ... }`.

---

## 5. Cryptography & Secret Hygiene

- Use the **Go standard library (`crypto/cipher`, `crypto/aes`, `crypto/rand`, `crypto/subtle`)** through a single internal AEAD wrapper (`internal/crypto/aead`).
- Wrap sensitive strings in a custom `secret.String` type that implements `fmt.Stringer` / `slog.LogValuer` returning `"[REDACTED]"` so secrets can never leak into logs, traces, or error outputs.

---

## 6. Mandatory Quality Gates

Run [`scripts/verify-go.sh`](./scripts/verify-go.sh) before every commit:

```bash
gofmt -s -l .
go vet ./...
golangci-lint run
govulncheck ./...
go test -race ./...
```
