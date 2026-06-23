# apps/ai

Python **FastAPI** AI service for oewang. Four capabilities, replying in English,
reading the same Postgres as the rest of the monorepo (read-only):

| Endpoint     | Method | Purpose                                                          |
| ------------ | ------ | --------------------------------------------------------------- |
| `/health`    | GET    | Health check (no auth)                                          |
| `/docs`      | GET    | Swagger UI (FastAPI built-in, no auth)                          |
| `/chat`      | POST   | Finance chatbot — context-aware (balance + recent transactions) |
| `/chat/web`  | POST   | Website-shaped chat (message array → rich contract). Phase 1.   |
| `/analyze`   | POST   | NLP: category + merchant + intent + sentiment (batch)           |
| `/advisor`   | POST   | RAG advisor over a finance/tax knowledge base                   |
| `/anomaly`   | POST   | Anomaly detection (IsolationForest + category spikes)           |

Standalone — not part of Turborepo/Bun. When `AI_SERVICE_URL` is set, Elysia
(`apps/api`) routes both the WhatsApp/Telegram path (`/chat`) and the website
canvas chat (`/chat/web`) through this service; if it's unset or unreachable it
falls back to the in-process AiService.

## Website chat port (in progress)

Goal: let the website's `/v1/ai/chat` be served by this Python service **without
breaking the canvas/artifact + in-chat tools**. Architecture: Python orchestrates
the LLM + tool-calling loop; tool execution, analytics (canvas payloads), and
quota stay in Elysia behind internal endpoints (one source of truth for the money
path). The website is **not** switched over until parity is proven.

- **Phase 1 (done):** `/chat/web` matches the request/response contract
  (`messages[]` → `{ reply, session_id, usage, artifact, provider }`).
- **Phase 2 (done):** Python drives the LLM tool-calling loop
  (`core/llm.py::complete_with_tools`, tool specs in `modules/chatbot/tools.py`
  mirroring the orchestrator's `buildTools`). Each tool call is forwarded to the
  Elysia internal endpoint `POST /v1/ai/internal/execute-tool` (wraps
  `executeAiTool` + the context/RAG tools); the analysis tools' canvas payload
  comes back as `artifact`. The system prompt is fetched from
  `GET /v1/ai/internal/system-prompt` (single source of truth). Both internal
  endpoints are exempt from the encrypted transport + rate limit and gated by the
  shared `AI_SERVICE_API_KEY`. _Not yet ported: the `webSearch` tool (its fetch
  logic lives only in the TS orchestrator)._
- **Phase 3 (done):** parity by reuse, not duplication. `AiService.chat` (TS)
  already owns session create/load, title generation, the quota check + token
  increment, message/artifact persistence, and dry-run (`executeAiTool` honors
  `receiptDryRun`). Phase 3 adds the bridge `chatWebViaSidecar` and swaps **only**
  the orchestrator step for the sidecar's `/chat/web` — everything around it is
  unchanged, so all of the above flows through automatically. Elysia passes the
  prebuilt `system_prompt` to the sidecar to avoid a call-back. _Known divergence:
  the sidecar is OpenAI-only and uses `temperature=0.7`; per-workspace
  model/temperature overrides aren't plumbed._
- **Phase 4 (done):** the website canvas chat is served by the sidecar whenever
  `AI_SERVICE_URL` is set — same gate as the WhatsApp/Telegram path, no separate
  flag. If the sidecar is unset or unreachable, `AiService.chat` falls back to the
  in-process orchestrator, so the canvas never breaks.

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
POST /chat     { "message": "...", "workspace_id": "...", "user_id": "...", "session_id": "..." }
POST /analyze  { "items": [{ "description": "...", "amount": 25000 }], "workspace_id": "..." }
POST /advisor  { "question": "...", "workspace_id": "..." }
POST /anomaly  { "workspace_id": "..." }
```

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
