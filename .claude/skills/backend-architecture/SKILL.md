---
name: backend-architecture
description: >-
  Backend Architecture, System Design, and Software Design skill based on roadmap.sh/backend,
  roadmap.sh/system-design, and roadmap.sh/software-design-architecture.
  Enforces Clean Architecture, Modular Monolith first, 12-Factor App, CAP/Consistency patterns,
  multi-layer caching (Cache-Aside, Write-Through), message brokers (Kafka/RabbitMQ), backpressure,
  and observability. Use when designing systems, services, or refactoring backend architecture.
---

# Backend Architecture & System Design Skill

Software architecture and distributed systems guidelines based on `roadmap.sh/backend`, `roadmap.sh/system-design`, and `roadmap.sh/software-design-architecture`.

---

## 1. Software Design & Clean Architecture

1. **Modular Monolith First**: Do not split into microservices until domain boundaries are stable and organizational or scaling bottlenecks require independent deployments.
2. **Dependency Rule (Boundary Isolation)**:
   - Keep core domain and business logic **free of framework, ORM, HTTP, or transport dependencies**.
   - Dependencies point strictly inward: `Delivery (HTTP/gRPC/CLI) -> Application/Use-Case -> Domain <- Infrastructure (DB/Cache/Queue)`.
3. **Core Design Principles**:
   - **Composition over Inheritance**: Assemble behavior via small interfaces/protocols/traits rather than deep class hierarchies.
   - **Command-Query Separation (CQS)**: Separate state-mutating operations (commands) from side-effect-free reads (queries).
   - **Rich Domain Models**: Enforce domain invariants inside entities and value objects rather than scattering checks across controllers.

---

## 2. Caching Strategies (`roadmap.sh/system-design`)

Select caching patterns explicitly based on read/write access profiles:

| Strategy | Flow | When to Use | Risk & Mitigation |
|----------|------|-------------|-------------------|
| **Cache-Aside** | App checks cache -> miss -> reads DB -> populates cache | Read-heavy workloads (Redis/Memcached) | Cache stampede -> mitigate with singleflight/mutex lock and TTL jitter |
| **Write-Through** | App writes synchronously to both cache and DB | Immediate read consistency required after writes | Higher write latency |
| **Write-Behind** | App writes to cache -> async worker flushes to DB | High-frequency counters or telemetry | Data loss risk if cache node crashes before flush |
| **HTTP / CDN Cache** | `Cache-Control`, `ETag`, `Last-Modified` | Static assets & public GET responses | Use content-hashed URLs or `stale-while-revalidate` |

- **Mandatory Rules**: Every cache key in Redis/Memcached **must have an explicit TTL** (with 5–10% random jitter to prevent thundering herds) and a configured `maxmemory-policy` (`allkeys-lru` / `volatile-lfu`).

---

## 3. Asynchronous Messaging & Event-Driven Patterns

- **Broker Selection**:
  - **RabbitMQ / SQS**: Background job queues, flexible routing, per-message retries, and Dead Letter Queues (DLQ).
  - **Kafka / Redpanda / NATS JetStream**: High-throughput event streaming, durable append-only logs, and replayable consumer groups.
- **Transactional Outbox Pattern**: Never execute `db.commit()` and `broker.publish()` as separate uncoordinated steps (dual-write bug). Persist outbound events to an `outbox` table inside the same DB transaction and relay them asynchronously.
- **Idempotent Consumers**: Message brokers provide *at-least-once delivery*. Every consumer **must be idempotent** (track processed `message_id` / `idempotency_key` or use `ON CONFLICT DO NOTHING`).
- **Backpressure & Graceful Shutdown**: Bound worker concurrency (`prefetch_count` / semaphores), route poison messages to a DLQ after $N$ retries with exponential backoff + jitter, and drain in-flight jobs on `SIGTERM`.

---

## 4. Scalability, High Availability & Observability

1. **Stateless Application Tier (12-Factor App)**: Externalize session and state to Redis or the database — never store request state in local process memory — enabling horizontal scaling behind L4/L7 load balancers.
2. **Timeouts & Circuit Breakers**: Every outbound network call (HTTP, DB, RPC) **must set an explicit timeout**. Never rely on infinite default timeouts.
3. **Three Pillars of Observability**:
   - **Structured Logs**: Emit JSON logs in production with `trace_id`, `request_id`, `user_id`, and latency.
   - **Metrics (RED Method)**: Track **R**ate (req/s), **E**rrors (err/s), and **D**uration (p50, p95, p99 histograms).
   - **Health Checks**: Expose separate `/healthz/live` (process alive) and `/healthz/ready` (DB/cache dependencies healthy) endpoints.
