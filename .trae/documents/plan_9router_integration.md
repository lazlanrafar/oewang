# Plan: 9Router Provider Migration & Real-Time Thinking Stream

## 1. Summary
Replace OpenAI-specific configurations with generic model provider configurations (`MODEL_BASE_URL`, `MODEL_API_KEY`, `AI_CHAT_MODEL`, `AI_VISION_MODEL`, `AI_EMBED_MODEL`). Connect all AI workloads (Chat, Receipt OCR, Import classification, Embeddings) to 9Router at `http://localhost:20128/v1` using model combo identifier `coder`. Implement real-time SSE streaming for chat to display AI reasoning/thinking process live.

---

## 2. Key Architecture & Renaming Design

### A. Environment Variable Decoupling
Replace `OPENAI_API_KEY` and add generic base URL support:
- `MODEL_BASE_URL`: Base URL for model completions & embeddings (default: `http://localhost:20128/v1`).
- `MODEL_API_KEY`: API key for proxy authentication (default: `9router` / optional local dummy).
- `AI_CHAT_MODEL`: Chat completion model (default: `coder`).
- `AI_VISION_MODEL`: Vision / Receipt OCR model (default: `coder`).
- `AI_EMBED_MODEL`: Embedding model (default: `coder` or `text-embedding-3-small` as proxied by 9router).

### B. Python Sidecar Provider Adapter (`apps/ai`)
- `apps/ai/app/core/llm.py`:
  - Initialize client with `base_url=get_settings().MODEL_BASE_URL` and `api_key=get_settings().MODEL_API_KEY`.
  - Strip direct OpenAI branding/references in provider logs and response payloads (`provider: {"name": "9router", ...}`).
  - Implement `complete_with_tools_stream(...)` supporting token streaming + live `reasoning_content` / `<think>...</think>` chunk extraction.

### C. Real-Time Thinking Process & Response Streaming
- `apps/ai/app/api/routes/chatbot.py`:
  - Implement `POST /chat/web/stream` returning Server-Sent Events (SSE).
  - Stream event types:
    - `event: thinking` → `{ "text": "..." }` (thinking/reasoning token chunks)
    - `event: tool_call` → `{ "name": "...", "args": {...} }` (status updates during tool run)
    - `event: content` → `{ "text": "..." }` (final reply tokens)
    - `event: artifact` → `{ "type": "...", "payload": {...} }` (canvas artifact data)
    - `event: done` → `{ "session_id": "...", "usage": {...} }` (completion signal)
- `apps/app/components/organisms/chat/chat-provider-wrapper.tsx`:
  - Consume SSE stream in `sendMessage`.
  - Update chat store with incremental reasoning stream and response tokens.
- `apps/app/components/organisms/chat/chat-messages.tsx`:
  - Render thinking accordion component showing live or completed reasoning blocks above response text.

---

## 3. Proposed File Changes

### 1. Environment & Monorepo Configuration
- **`apps/ai/app/config.py`**:
  - Replace `OPENAI_API_KEY` with `MODEL_API_KEY: str = "9router"`.
  - Add `MODEL_BASE_URL: str = "http://localhost:20128/v1"`.
  - Update defaults: `AI_CHAT_MODEL: str = "coder"`, `AI_VISION_MODEL: str = "coder"`, `AI_EMBED_MODEL: str = "coder"`.
- **`apps/api/config/env.ts`**:
  - Remove `OPENAI_API_KEY`, add `MODEL_BASE_URL: z.string().url().optional()`, `MODEL_API_KEY: z.string().optional()`.
- **`apps/app/env.ts`**:
  - Add `MODEL_BASE_URL: z.string().url().optional()`, `MODEL_API_KEY: z.string().optional()`.
- **`packages/constants/src/env.ts`**:
  - Remove `OPENAI_API_KEY`, add `MODEL_BASE_URL: z.string().url().optional()`, `MODEL_API_KEY: z.string().optional()`.
- **`.env`, `.env.example`, `.env.global.example`, `.env.api`**:
  - Replace `OPENAI_API_KEY` with `MODEL_BASE_URL=http://localhost:20128/v1` and `MODEL_API_KEY=9router`.
  - Set `AI_CHAT_MODEL=coder`, `AI_VISION_MODEL=coder`, `AI_EMBED_MODEL=coder`.
- **`turbo.json`**:
  - Update `globalEnv` with `MODEL_BASE_URL` and `MODEL_API_KEY`.

### 2. Python AI Sidecar (`apps/ai`)
- **`apps/ai/app/core/llm.py`**:
  - Configure client with `MODEL_BASE_URL` and `MODEL_API_KEY`.
  - Add streaming generator `complete_with_tools_stream(...)` capturing reasoning content (`choice.delta.reasoning_content` and `<think>` blocks).
- **`apps/ai/app/modules/chatbot/service.py`**:
  - Add `stream_web_chat(...)` yielding stream events and handling `chat_begin` / `chat_end` persistence.
- **`apps/ai/app/api/routes/chatbot.py`**:
  - Expose `POST /chat/web/stream` returning `StreamingResponse(media_type="text/event-stream")`.
- **`apps/ai/app/core/embeddings.py`**:
  - Use `MODEL_BASE_URL` and `AI_EMBED_MODEL` for 1536-dim vector embeddings.
- **`apps/ai/app/modules/receipt/service.py` & `imports/service.py`**:
  - Use `AI_VISION_MODEL` / `AI_CHAT_MODEL` with generic model client.

### 3. Frontend Web App (`apps/app`)
- **`apps/app/components/organisms/chat/chat-provider-wrapper.tsx`**:
  - Stream reader for SSE chunks (`thinking`, `content`, `artifact`, `done`).
  - Update chat UI state in real time.
- **`apps/app/components/organisms/chat/chat-messages.tsx`**:
  - Render Collapsible "Thinking Process" block with realtime animated indicator.

---

## 4. Verification & Testing
1. **Sidecar Tests**:
   - Run `pytest apps/ai/tests` to verify parsing, chunking, and client initialization.
2. **Type & Linter Check**:
   - Run `bun run typecheck` and `bun run lint` across monorepo workspaces.
3. **End-to-End Live Check**:
   - Start 9router on `http://localhost:20128/v1`.
   - Start app with `bun run dev`.
   - Send chat prompt; verify real-time thinking process and token streaming in browser.
