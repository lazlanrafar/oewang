# Reference: Midday AI Architecture

> Research reference from `/references/midday`. Use as inspiration for evolving oewang's AI chat, tool calling, and MCP integration.
>
> See also: [FEAT_AI.md](./FEAT_AI.md) · [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Overview

Midday's AI assistant is a streaming, tool-calling financial chat agent built on the **Vercel AI SDK** (`ai` package). It combines:

1. **Internal MCP tools** — 16 domain tools (transactions, invoices, tracker, reports, etc.) served from an in-process MCP server.
2. **External app tools** — 100+ third-party integrations (Gmail, Slack, Notion, GitHub, Linear, etc.) via the **Composio** meta-layer.
3. **MCP HTTP transport** — an OAuth-protected endpoint that lets external clients (Claude Desktop, ChatGPT, Cursor, Copilot, etc.) connect to the same tool server.

---

## Request → Response Flow

```
POST /chat (UIMessages + file attachments)
  │
  ├─ Rate limit check (sliding window, per-user)
  ├─ File processing (convert attachments → model parts)
  ├─ buildSystemPrompt()  ← user context: timezone, locale, settings, date
  ├─ convertToModelMessages()
  ├─ stripFileAndImageParts()  ← removes encoded blobs from history
  │
  └─ createUIMessageStream({ execute: streamMiddayAssistant() })
        │
        ├─ createMcpClient()  ← InMemoryTransport to local MCP server
        ├─ bootstrapToolIndex()  ← embed tool definitions via OpenAI text-embedding-3-small
        ├─ getComposioTools()  ← cached meta-tools for external apps
        │
        └─ new ToolLoopAgent({ model, tools, system, messages })
              │
              └─ agent.stream({ experimental_transform: smoothStream() })
                    │
                    └─ result.toUIMessageStream({ sendSources: true })
                          │
                          └─ createUIMessageStreamResponse()  ← SSE HTTP response
```

**Custom data injected into the stream before agent starts:**

- `data-title` — auto-generated chat title (only on first turn, via `gpt-4o-mini`)
- `data-rate-limit` — `{ limit, remaining }` for frontend rate limit display

---

## AI SDK Stack

| Package              | Role                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| `ai` (Vercel AI SDK) | `ToolLoopAgent`, `smoothStream`, `UIMessageStream`, `generateText`           |
| `@ai-sdk/openai`     | Primary LLM — `gpt-4.1-mini` for chat, `gpt-4o-mini` for title generation    |
| `@ai-sdk/anthropic`  | Alternative model support                                                    |
| `@ai-sdk/mcp`        | MCP client integration (converts MCP tools → AI SDK tool format)             |
| `@ai-sdk/react`      | Frontend `useChat` hook + `DefaultChatTransport`                             |
| `toolpick`           | Semantic embedding-based tool selection (reduces active tool count per step) |

---

## MCP Server

### Server Setup (`apps/api/src/mcp/server.ts`)

```typescript
// Factory that registers all capabilities
createMcpServer(context: McpContext): McpServer
```

`McpContext` carries the authenticated user's scope: `{ teamId, userId, ... }`.

The server registers four capability types:

| Type          | Count | Purpose                                               |
| ------------- | ----- | ----------------------------------------------------- |
| **Tools**     | 16    | Domain actions (CRUD + queries)                       |
| **Resources** | ~5    | Static/semi-static data (team info, categories, etc.) |
| **Prompts**   | ~4    | Analysis prompt templates (spending report, etc.)     |
| **MCP Apps**  | ~15   | HTML/UI resources served to MCP clients               |

### Tool Domains

```
transactions_list         transactions_create        transactions_update
invoices_list             invoices_create            invoices_get
customers_list            customers_create
tracker_list              tracker_create
reports_spending          reports_profit_loss
documents_list            documents_search
bank_accounts_list
inbox_list
```

### MCP Transport Modes

| Mode          | When Used                                   | Transport                 |
| ------------- | ------------------------------------------- | ------------------------- |
| **In-memory** | Internal bootstrap (chat endpoint)          | `InMemoryTransport` pair  |
| **HTTP**      | External clients (Claude, ChatGPT, Cursor…) | `StreamableHTTPTransport` |

The HTTP transport endpoint (`/mcp`) is OAuth-protected — external clients authenticate via the same OAuth flow before connecting.

### Tool Input/Output Contracts

All tool inputs/outputs are defined as **Zod schemas** in `mcp/schemas.ts`. This is the single source of truth — no duplicate TypeScript interfaces.

---

## Tool Selection Strategy (toolpick)

Because the agent has access to 16+ MCP tools plus 100+ Composio tools, loading all of them per step is expensive and confusing. Midday uses **semantic tool selection**:

```
1. Embed all tool definitions once → cache in ToolIndex
2. On each agent step:
   a. Embed the current user message
   b. Vector similarity search → top N most relevant tools
   c. Add "related tools" (e.g., invoices_create → customers_list always included)
   d. Always include: [web_search, COMPOSIO_SEARCH_TOOLS, COMPOSIO_MULTI_EXECUTE_TOOL]
   e. Cap at 12 tools per step
```

Embedding model: `text-embedding-3-small` (OpenAI).
Related tools map is hardcoded — if tool A is selected, tool B is always added alongside it.

---

## External App Integration (Composio)

Composio acts as a **meta-tool layer** — instead of building individual integrations for Gmail, Slack, Notion, GitHub, Linear, etc., the agent gets two meta-tools:

| Tool                          | Purpose                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| `COMPOSIO_SEARCH_TOOLS`       | Given a user intent, return matching actions from the app catalog |
| `COMPOSIO_MULTI_EXECUTE_TOOL` | Execute one or more selected Composio actions                     |

**Flow:**

```
User: "Send a Slack message to #finance about this invoice"
  → agent calls COMPOSIO_SEARCH_TOOLS("send slack message")
  → gets back: [slack_send_message, slack_send_dm, ...]
  → agent calls COMPOSIO_MULTI_EXECUTE_TOOL([{ action: "slack_send_message", params: {...} }])
```

**Caching:** toolkit list is cached per user with a 2-minute TTL to reduce Composio API calls.

**Allowed apps (CURATED_TOOLKIT_SLUGS):** only pre-approved toolkits are surfaced (Gmail, Outlook, Slack, Telegram, Notion, GitHub, Linear, QuickBooks, Xero, Stripe, etc.).

---

## System Prompt Design

`apps/api/src/chat/prompt.ts` builds a 150+ line system prompt injected with live user context:

```
- Current date/time in user's timezone
- User's locale and currency
- Workspace name and team settings
- Active bank accounts and their balances
- Invoice workflow rules:
    - ALWAYS create invoices as drafts
    - ALWAYS confirm before sending
    - Never auto-send without explicit user approval
- Tool routing rules:
    - Use internal tools for Midday data
    - Use Composio for external app actions
    - Use web_search for real-time info
- Response formatting rules:
    - Use markdown tables for lists
    - Always include sources when citing data
    - Respond in the user's language
```

The system prompt is the primary mechanism for safety guardrails (draft-only invoices, confirmation requirements).

---

## Frontend Chat Integration

### State Management

```typescript
// chat-context.tsx
const { messages, sendMessage, status } = useChat({
  transport: new DefaultChatTransport({
    url: "/api/chat",
    headers: { Authorization: `Bearer ${token}`, "x-user-timezone": timezone },
    body: { mentionedApps, timezone, localTime },
  }),
  onData: (data) => {
    if (data.type === "data-title") setChatTitle(data.title);
    if (data.type === "data-rate-limit") setRateLimit(data);
  },
  onError: (err) => {
    if (err.status === 429) showRateLimitUI();
  },
});
```

### Message Rendering

- **Tool calls** rendered with icons, execution state (`request-made` → `output-available` → `output-error`), and collapsible output panels.
- **Sources** displayed as citation links below the response.
- **Markdown** rendered via the `streamdown` library.
- **Thinking indicator** shown while agent is reasoning.
- **Invoice canvas** — special full-panel preview when agent creates/edits an invoice.

### MCP App Mentions

Users can `@mention` connected MCP apps (e.g., `@Gmail`, `@Slack`) in the chat input. The mention list is populated from the user's active Composio connections. Mentioned apps are sent in the request body and used to bias tool selection.

---

## MCP Client App Store

`packages/app-store/src/` contains connection configs for 15+ MCP client apps:

| Category      | Apps                                                                    |
| ------------- | ----------------------------------------------------------------------- |
| AI Assistants | claude-mcp, chatgpt-mcp, gemini-mcp, perplexity-mcp                     |
| IDEs / Code   | cursor-mcp, copilot-mcp, cline-mcp, windsurf-mcp, zed-mcp, opencode-mcp |
| Productivity  | raycast-mcp                                                             |
| Automation    | n8n-mcp, make-mcp, zapier-mcp, manus-mcp                                |

Each app config provides:

- OAuth setup instructions rendered as a UI guide
- Connection URL template (`https://app.midday.ai/mcp`)
- Required OAuth scopes

These are **read-only config objects** — the actual OAuth and transport is handled by the `mcp.ts` router.

---

## Key Patterns to Adopt in oewang

### 1. Tool Indexing for Large Tool Sets

When tool count exceeds ~10, use semantic embedding to select the most relevant tools per step rather than loading all tools always. This reduces context window usage and improves routing accuracy.

### 2. Custom Stream Data Channels

The `UIMessageStream` supports injecting non-message data (titles, rate limits, metadata) alongside the AI response. This is cleaner than polling separate endpoints.

### 3. System Prompt as Safety Contract

Put safety rules (draft-only, confirmation requirements) in the system prompt rather than in code guards. Easier to update without deployments.

### 4. Composio as External App Meta-Layer

Instead of building N integrations, expose `search_tools` + `execute_tools` meta-tools backed by Composio. The agent figures out which app actions to use from intent.

### 5. MCP Server for External Access

Serve the same tools via an HTTP MCP transport so power users can connect Claude Desktop, Cursor, etc. directly — no extra API surface to maintain.

### 6. Streaming Title Generation

Generate the chat session title in parallel with the first response, then push it as a custom stream event. Avoids a separate round-trip.

---

## Dependencies Reference

```jsonc
// API
"@ai-sdk/openai": "^catalog",
"@ai-sdk/anthropic": "^3.0.64",
"@ai-sdk/mcp": "^1.0.30",
"ai": "^catalog",
"@composio/core": "^0.6.7",
"@composio/vercel": "^0.6.7",
"@modelcontextprotocol/sdk": "^catalog",
"toolpick": "^catalog",

// Dashboard
"@ai-sdk/react": "^3.0.143",
```
