---
name: database-sql
description: >-
  Database Engineering, PostgreSQL Optimization, and Backend Performance skill based on roadmap.sh/sql,
  roadmap.sh/backend, roadmap.sh/backend-performance-best-practices, and Supabase Postgres best practices.
  Enforces relational modeling, multi-tenant RLS & soft deletes, CUID2/UUIDv7 keys, atomic relative ledger updates,
  B-Tree/GIN/HNSW indexing, N+1 prevention, EXPLAIN ANALYZE profiling, and zero-downtime migrations.
  Use when writing SQL queries, designing schemas, configuring RLS, using Drizzle/SQLx/pgx, or tuning Postgres.
---

# Database & PostgreSQL Engineering Skill

Database schema design, SQL authoring, and PostgreSQL performance guidelines based on `roadmap.sh/sql`, `roadmap.sh/backend-performance-best-practices`, and `supabase-postgres-best-practices`.

---

## 1. Schema Design, Multi-Tenancy & Data Integrity

1. **Database as the Final Fortress of Integrity**:
   - Enforce constraints in the database: `PRIMARY KEY`, `FOREIGN KEY`, `NOT NULL`, `UNIQUE`, and `CHECK`.
2. **Precision Data Types (PostgreSQL Standard)**:
   - **Money / Financial amounts**: **`NUMERIC(p, s)`** or integer minor units. **Never use `FLOAT`/`REAL` for money**. Represent amounts on the wire as strings or `Decimal`, never IEEE-754 floats.
   - **Timestamps**: Always store UTC using **`TIMESTAMPTZ`** (`timestamp with time zone`).
   - **Primary Keys**: Prefer **prefixed CUID2** (`text`, e.g., `wi_tz4a98xx...`) or **UUIDv7** / `BIGINT GENERATED ALWAYS AS IDENTITY`. **Never sort by CUID2/random ID alone** — always sort by `(created_at, id)`.
3. **Multi-Tenancy & Soft Deletes**:
   - Every tenant-scoped query **must filter by `organization_id` (or `workspace_id`) AND `deleted_at IS NULL`**.
   - Never hard-delete workspace/tenant rows unless executing an explicit compliance purge; use soft deletes (`deleted_at = NOW()`).

---

## 2. Row-Level Security (RLS) Performance (`supabase-postgres`)

- Enable and force RLS on every multi-tenant table:
  ```sql
  ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
  ALTER TABLE documents FORCE ROW LEVEL SECURITY;
  ```
- **Cache Session Functions via `initPlan`**: Wrapping `current_setting(...)` or `auth.uid()` in a scalar `(SELECT ...)` forces Postgres to evaluate it **once per query** instead of once per row:
  ```sql
  -- BAD: re-evaluates current_setting() on every row scan
  CREATE POLICY tenant_isolation ON documents
    USING (organization_id = current_setting('app.organization_id', true));

  -- GOOD: evaluated once via initPlan and uses B-Tree index on organization_id
  CREATE POLICY tenant_isolation ON documents
    USING (organization_id = (SELECT current_setting('app.organization_id', true)));
  ```
- **Always index every column referenced in an RLS `USING` or `WITH CHECK` clause**.

---

## 3. Indexing Strategy (B-Tree, GIN, Partial, Covering, `pgvector`)

- **B-Tree** (default): Equality (`=`) and range predicates (`<, <=, >, >=, BETWEEN, ORDER BY`).
- **Composite Index `(organization_id, status, created_at DESC)`**: Place tenant/equality columns first and range/sort columns last (*Leftmost Prefix Rule*).
- **Partial Index (`WHERE deleted_at IS NULL`)**: Exclude soft-deleted or archived rows to keep active indexes compact:
  ```sql
  CREATE INDEX CONCURRENTLY idx_orders_active
    ON orders (organization_id, created_at DESC)
    WHERE deleted_at IS NULL;
  ```
- **Covering Index (`INCLUDE`)**: Attach payload columns to achieve **Index-Only Scans** without heap fetches.
- **GIN Index**: Use for `JSONB` containment (`@>`), array membership, and Full-Text Search (`tsvector`).
- **`pgvector` Semantic Search**: Always prefer **HNSW** (`USING hnsw (embedding vector_cosine_ops)`) over `ivfflat` for production workloads — HNSW maintains recall across inserts without periodic index rebuilds.

---

## 4. Ledger Safety, Locking & Concurrency

1. **Relative Atomic Balance Updates (No Read-Modify-Write Races)**:
   - Never compute a new balance/points/stock total in application memory from an earlier `SELECT` and write the absolute number back.
   - Perform relative updates with the guard inside the `WHERE` clause:
     ```sql
     UPDATE accounts
        SET balance = balance - $1,
            updated_at = NOW()
      WHERE id = $2
        AND organization_id = $3
        AND balance >= $1
     RETURNING balance;
     ```
2. **Deterministic Lock Ordering**:
   - When locking multiple wallet/inventory rows in a transaction, always lock with `SELECT ... FOR UPDATE` **sorted by ascending `id`** to make deadlocks impossible.
3. **Keep Transactions Short & Atomic**:
   - Write audit and activity log rows **inside the same database transaction** as the domain mutation.
   - **Never perform external HTTP calls inside an open database transaction.**
4. **Database Queues**: Use `FOR UPDATE SKIP LOCKED` (or River / `pgmq`) for background job consumers so workers never block one another.

---

## 5. Query Optimization & Zero-Downtime Migrations

- **Eliminate N+1 Queries**: Never query inside a loop; use `JOIN`, `WHERE id = ANY($1::text[])`, or Drizzle/SQLx batch queries.
- **Sargable Queries**: Never wrap indexed columns in functions (`WHERE DATE(created_at) = ...`); compare against half-open timestamp ranges (`created_at >= $1 AND created_at < $2`).
- **Profile with `EXPLAIN (ANALYZE, BUFFERS)`**: Watch for *Seq Scans* on large tables, row estimate mismatches, and high *shared read* buffer counts.
- **Expand-and-Contract Migrations**: Use `CREATE INDEX CONCURRENTLY`, add nullable columns or defaults without table rewrites, backfill in batches, and drop obsolete columns only after all readers have migrated.
