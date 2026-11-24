---
name: api-security
description: >-
  API Design and API Security skill based on roadmap.sh/api-design and roadmap.sh/api-security-best-practices.
  Enforces REST/gRPC/GraphQL/SSE design standards, RFC 7807 Problem Details, cursor pagination,
  idempotency keys, rate limiting, AuthN/AuthZ (JWT, OAuth2, RBAC/ReBAC), and OWASP API security.
  Use when designing, building, or auditing HTTP/gRPC/GraphQL APIs and authentication flows.
---

# API Design & Security Skill

API design and application security guidelines based on `roadmap.sh/api-design` and `roadmap.sh/api-security-best-practices`.

---

## 1. Choosing an API Paradigm

| Paradigm | Best Use Case | Contract / Schema |
|----------|---------------|-------------------|
| **REST (JSON)** | Public APIs, resource-oriented CRUD, standard HTTP caching | OpenAPI 3.1 |
| **gRPC (Protobuf)** | Low-latency internal microservice RPC, bidirectional streaming | `.proto` (Protocol Buffers) |
| **GraphQL** | Diverse clients (mobile/web) needing flexible field selection | GraphQL SDL (must enforce query depth limits & solve N+1 via DataLoader) |
| **SSE / WebSockets** | Unidirectional server push (SSE — HTTP/proxy friendly) or full-duplex realtime (WebSockets) | Typed event schema |

---

## 2. RESTful API Design Standards

1. **URI & HTTP Semantics**:
   - Use plural kebab-case nouns: `/v1/orders/{order_id}/items`.
   - `GET` & `HEAD` (safe, idempotent), `PUT` & `DELETE` (idempotent), `POST` (create/action — enforce idempotency via `Idempotency-Key` header), `PATCH` (partial update).
2. **Precise Status Codes**:
   - `200 OK`, `201 Created` (include `Location` header), `202 Accepted` (async job), `204 No Content`.
   - `400 Bad Request` (malformed syntax), `401 Unauthorized` (unauthenticated), `403 Forbidden` (unauthorized), `404 Not Found`, `409 Conflict` (state/duplicate conflict), `422 Unprocessable Content` (domain validation error), `429 Too Many Requests` (include `Retry-After` header).
3. **Standard Error Responses (RFC 9457 / RFC 7807 Problem Details)**:
   Use a uniform error envelope across all endpoints:
   ```json
   {
     "type": "https://example.com/probs/out-of-credit",
     "title": "Insufficient balance",
     "status": 422,
     "detail": "Current balance is 30, but item costs 50.",
     "instance": "/v1/orders/ord_123",
     "request_id": "req_01J9XYZ"
   }
   ```
4. **Pagination**:
   - Prefer **Cursor-based pagination** (`?cursor=eyJpZCI6MTAwfQ&limit=25`) on large or real-time tables to avoid offset drift and slow `OFFSET` scans.
   - Always enforce a hard `max_limit` (e.g., 100 items per page).

---

## 3. Authentication (AuthN) & Authorization (AuthZ)

- **Password Hashing**: Use **Argon2id** (preferred) or `bcrypt` / `scrypt`. Never use plain SHA-256/MD5.
- **Sessions vs. JWT**:
  - First-party web apps: prefer **Server-side Sessions** with `HttpOnly; Secure; SameSite=Lax` cookies (instant revocation).
  - Stateless APIs / Mobile: use **Short-lived Access Tokens (JWT, 5–15 min)** paired with **Rotating Refresh Tokens** persisted and revocable in the DB.
  - **JWT Hardening**: Pin allowed signing algorithms explicitly (reject `alg: none`), validate `iss`, `aud`, and `exp`, and never place secrets or PII in JWT payloads.
- **Authorization (BOLA / IDOR Prevention)**:
  - **OWASP API Security #1 risk is Broken Object Level Authorization (BOLA/IDOR)**.
  - Every read/update/delete query taking a client-supplied resource ID **must scope the query by owner/tenant** (`WHERE id = $1 AND org_id = $2`).

---

## 4. Input/Output Hardening

1. **Strict Schema Validation**: Reject unknown fields (`extra="forbid"` / `additionalProperties: false`) to prevent Mass Assignment, and cap request body sizes (e.g., 1–5 MB).
2. **Rate Limiting & Throttling**: Enforce Token Bucket or Sliding Window limits per IP and per User/API Key, with strict tiers on login, OTP, and expensive search endpoints.
3. **CORS & Security Headers**:
   - Never combine `Access-Control-Allow-Origin: *` with `Access-Control-Allow-Credentials: true`.
   - Always set `Strict-Transport-Security` (HSTS), `X-Content-Type-Options: nosniff`, and `Content-Security-Policy`.
4. **Zero Sensitive Data in Logs/Errors**: Never leak internal stack traces to clients or log `Authorization` headers, tokens, passwords, or payment details.
