# apps/ai

Python **FastAPI** AI service for oewang. Four capabilities, replying in English,
reading the same Postgres as the rest of the monorepo (read-only):

| Endpoint     | Method | Purpose                                                          |
| ------------ | ------ | --------------------------------------------------------------- |
| `/health`    | GET    | Health check (no auth)                                          |
| `/docs`      | GET    | Swagger UI (FastAPI built-in, no auth)                          |
| `/chat`      | POST   | Finance chatbot — context-aware (balance + recent transactions) |
| `/chat/web`  | POST   | Website canvas chat — called directly by the Next.js server action (JWT + x-api-key). Drives the tool loop; money path via Elysia internal endpoints. |
| `/analyze`   | POST   | NLP: category + merchant + intent + sentiment (batch)           |
| `/advisor`   | POST   | RAG advisor over a finance/tax knowledge base                   |
| `/anomaly`   | POST   | Anomaly detection (IsolationForest + category spikes)           |

Standalone — not part of Turborepo/Bun. When `AI_SERVICE_URL` is set, this service
runs the WhatsApp/Telegram path (`/chat`, called by Elysia) and the website canvas
chat (`/chat/web`, called **directly by the Next.js server action**).

## Website canvas chat — direct web→ai flow

The browser's server action calls Python `/chat/web` **directly** (not through
Elysia), so Elysia is never holding the long multi-step LLM request. Python drives
the LLM + tool loop, but the **money path stays in Elysia** behind internal
endpoints (one source of truth, and this service keeps read-only DB access):

```
Next.js server action ──(JWT + x-api-key)──▶ Python /chat/web
   Python ──▶ POST /v1/ai/internal/chat-begin   (getAuth(JWT) → identity;
                                                  session + quota + system prompt)
   Python ──▶ POST /v1/ai/internal/execute-tool  (per tool; DB writes, canvas)
   Python ──▶ POST /v1/ai/internal/chat-end      (persist reply + increment tokens)
Next.js ◀── { reply, usage, artifact, provider }
```

- **Identity:** the server action forwards the user's session JWT; `chat-begin`
  resolves it via the **same `getAuth`** Elysia uses (membership-checked,
  authoritative). Python never holds the JWT secret; workspace/user are never
  taken from the request body.
- **Token usage / quota:** `chat-begin` reads the current token count and runs the
  quota check (throws `PLAN_LIMIT_REACHED` 422 with `reset_at`, forwarded verbatim
  to the browser); `chat-end` increments `current_tokens + spent`. Identical math
  to the in-process path — both call the shared `AiService.chatBegin/chatEnd`.
- **Tools + canvas:** each tool call hits `execute-tool` (Phase 2); the analysis
  tools' payload returns as `artifact`. Dry-run still honored (it lives in
  `executeAiTool`). All `/v1/ai/internal/*` endpoints are exempt from the
  encrypted transport + rate limit and gated by the shared `AI_SERVICE_API_KEY`.
- **Fallback:** if `AI_SERVICE_URL` is unset or Python is **unreachable** (network
  error), the server action falls back to the encrypted in-process `/v1/ai/chat`
  (`AiService.chat`), so the canvas never breaks. A reachable-but-erroring sidecar
  (4xx/5xx) is surfaced, **not** retried — `chat-begin` may have already created
  the session, and a retry would duplicate it + double-spend tokens.
- _Not ported: the `webSearch` tool (TS-only fetch); per-workspace
  model/temperature on the sidecar (OpenAI-only, `temperature=0.7`)._

## Setup

The venv was made with uv but is pip-compatible. With **uv**:

```bash
cd apps/ai
uv sync                      # or: uv pip install -e ".[dev]"
```

…or with plain **pip** (no uv needed):

```bash
cd apps/ai
python3.12 -m venv .venv && source .venv/bin/activate   # if no .venv yet
.venv/bin/python -m ensurepip --upgrade                 # if venv has no pip
pip install -e ".[dev]"
```

Env vars live in the **single root `.env`** (see `.env.example` for the keys).

## Database prerequisites (run once, from repo root)

```bash
bun run db:push                              # creates ai_knowledge_chunks
bun run packages/database/setup-vector.ts    # pgvector + HNSW indexes
cd apps/ai && python scripts/seed_knowledge.py   # embeds knowledge/*.md
```

## Run

```bash
cd apps/ai
uvicorn app.main:app --reload --port 3004
# open http://localhost:3004/docs
```

## Auth

All feature endpoints require the `x-api-key` header matching `AI_SERVICE_API_KEY`.
Leave that var empty in dev to disable auth. `/health` and `/docs` are always open.

## Request shapes

```jsonc
POST /chat      { "message": "...", "workspace_id": "...", "user_id": "...", "session_id": "..." }
POST /chat/web  // headers: Authorization: Bearer <session JWT>, x-api-key: <AI_SERVICE_API_KEY>
                { "messages": [{ "role": "user", "content": "..." }], "session_id": "...", "web_search": false }
POST /analyze   { "items": [{ "description": "...", "amount": 25000 }], "workspace_id": "..." }
POST /advisor   { "question": "...", "workspace_id": "..." }
POST /anomaly   { "workspace_id": "..." }
```

`/chat/web` is identity-bound: workspace/user are resolved from the JWT in Elysia,
never from the body.

Currency is formatted per the workspace's `workspace_settings` (mirrors
`packages/utils/currency.ts`); categories come from the workspace's `categories`
table. The anomaly background scan is opt-in via `ANOMALY_SCAN_HOURS` (> 0).

## Test

```bash
pytest        # 18 tests — pure logic, no DB/LLM/network
```

## Layout

```
app/
  main.py              FastAPI app, /health, routers, rate limit, scheduler
  config.py            Settings (reads root .env)
  core/                database (asyncpg), llm + embeddings (OpenAI), currency
  api/routes/          chatbot, analyzer, advisor, anomaly
  api/middleware/      auth (x-api-key)
  modules/             one package per capability (service + helpers + knowledge)
  schemas/             Pydantic request/response models
scripts/seed_knowledge.py
tests/
```
