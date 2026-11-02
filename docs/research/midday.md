# Research: Midday

Status: draft v0.1, 2026-11-02. Part of the [oewang docs](../README.md). Source read: `references/midday`, commit snapshot of 2026-11-02.

Reverse engineering of Midday, an open-source finance tool for small businesses, focused on the three things oewang is building: the AI chat, the chat canvas, and AI-assisted transaction import. Ends with numbered proposals (P1 to P18) and a verdict on each. Thirteen adopted (D27 to D36), three deferred, two rejected on security grounds.

Research explains. It does not decide. Decisions adopted from this document are recorded in the [decision log](../architecture.md#decision-log).

## Update this doc when

- The reference copy is updated and a finding no longer holds.
- A proposal is adopted or rejected. Record the verdict here and the decision in the log.

## What Midday is

A Turborepo monorepo, Bun, TypeScript throughout. Five apps (`api`, `dashboard`, `desktop`, `website`, `worker`) and 35 packages. Scope is far wider than oewang: transactions, invoices, customers, time tracking, inbox, documents, bank connections, reports, an app store, a CLI, a desktop app, and MCP servers for ChatGPT and Claude.

Relevant stack facts:

| Concern | Midday |
|---|---|
| AI framework | Vercel AI SDK (`ai` 6.x), `ToolLoopAgent` |
| Chat model | `gpt-4.1-mini` |
| Extraction models | `mistral-small-latest`, `gemini-3-flash-preview`, `gemini-3-pro-preview` |
| Tool transport | Its own MCP server, connected in-process over `InMemoryTransport` |
| Tool selection | `toolpick`, embedding-based, `text-embedding-3-small` |
| Markdown rendering | `streamdown` |
| Background work | BullMQ and Trigger.dev |
| Data layer | tRPC, Drizzle, Supabase |

Files worth reading in full: `apps/api/src/chat/{assistant-runtime,tools,prompt}.ts`, `apps/dashboard/src/components/chat/*`, `packages/import/src/*`, `packages/documents/src/processors/base-extraction-engine.ts`, `docs/inbox-matching.md`, `docs/weekly-insights.md`.

---

## 1. Chat architecture

### 1.1 One tool definition, two consumers

Midday does not define chat tools separately from its MCP tools. The chat starts its own MCP server in memory and talks to it over a linked transport pair:

```ts
// apps/api/src/chat/tools.ts
const mcpServer = createMcpServer(ctx);
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await mcpServer.connect(serverTransport);
const client = await createMCPClient({ transport: clientTransport, name: "midday-bootstrap" });
const definitions = await client.listTools();
```

So the same registry serves the in-app assistant, ChatGPT's MCP connector, and Claude's. There is one place where a tool's schema, description, scope and annotations live.

Tools are registered per domain (`mcp/tools/transactions.ts`, `invoices.ts`, and fourteen more) and gated by scope at registration time, not at call time:

```ts
const hasReadScope = hasScope(ctx, "transactions.read");
const hasWriteScope = hasScope(ctx, "transactions.write");
if (!hasReadScope && !hasWriteScope) return;
```

A caller without the scope never sees the tool exists. Each tool carries MCP annotations: `READ_ONLY_ANNOTATIONS`, `WRITE_ANNOTATIONS`, `DESTRUCTIVE_ANNOTATIONS` with `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`.

### 1.2 Semantic tool selection

With roughly 90 tools registered, putting all of them in the prompt is not viable. Midday indexes the tool descriptions as embeddings and selects at most 12 per step:

```ts
const index = await createToolIndex(tools, {
  embeddingModel: openai.embeddingModel("text-embedding-3-small"),
  embeddingCache: fileCache(".toolpick-cache.json"),
  relatedTools: {
    invoices_create: ["customers_list"],
    transactions_update: ["categories_list"],
    tracker_timer_start: ["tracker_projects_list"],
  },
});
```

Three details worth noting:

- `relatedTools` is a hand-maintained graph. Selecting `invoices_create` also activates `customers_list`, because the model will need a customer ID. This encodes the dependency the prompt otherwise has to teach.
- `alwaysActive` keeps `web_search` and `search_tools` in every step, because the index would otherwise filter out provider-built-in tools.
- The index is warmed at server startup so the first chat request does not pay the bootstrap and embedding cost.

The model also gets a `search_tools` meta-tool to find anything the selector missed.

### 1.3 The agent loop

```ts
const agent = new ToolLoopAgent({
  model: openai("gpt-4.1-mini"),
  instructions: systemPrompt,
  tools: { ...mcpTools, ...composioMetaTools, search_tools, web_search },
  prepareStep: buildPrepareStep({ maxTools: 12, alwaysActive: [...] }),
  stopWhen: stepCountIs(10),
  onFinish: closeClient,
});
const result = await agent.stream({ messages, experimental_transform: smoothStream() });
```

Ten steps, twelve tools per step, `smoothStream()` to even out token delivery. The MCP client is closed in `onFinish` and in the catch path, with a `closed` guard so it cannot double-close.

### 1.4 The system prompt

169 lines, and the structure is the interesting part, not the length.

**Date context is computed, not described.** The prompt carries today's date, the quarter, and the start of the month, quarter and year, all precomputed in the user's timezone:

```
- Today: 2026-11-02 (Q4 2026)
- This month: 2026-11-01 to 2026-11-02
- This quarter: 2026-10-01 to 2026-11-02
- This year: 2026-01-01 to 2026-11-02
```

A model asked "how did I do this quarter" never has to derive a quarter boundary.

**Rule 1 is the anti-hallucination rule**, and it is first:

> NEVER invent or guess numbers, amounts, dates, names, or IDs. Every data point must come from a tool call.

**Date format is split in two.** ISO 8601 for every tool parameter, the user's format only for display. This is an easy bug to ship and a one-line fix in the prompt.

**Tool routing is explicit.** Internal data goes to internal tools, named external services go to the connected-apps meta-tools, real-time facts go to web search, and the prompt forbids routing internal requests through the external path.

**The UI is described to the model.** After creating an invoice the prompt says the UI already renders a full preview in a side panel, so the model must not repeat any of it in text. One short sentence, then stop. This is how the canvas and the text stay out of each other's way.

**Formatting is mandated, not suggested.** Three or more items must be a markdown table. Entity names must be clickable links in a fixed scheme.

### 1.5 Entity deep links

The prompt instructs the model to emit links in a private scheme:

```
Transactions:  [Name](#txn:TRANSACTION_ID)
Invoices:      [INV-001](#inv:INVOICE_ID)
Customers:     [Customer Name](#cust:CUSTOMER_ID)
Connect bank:  [Connect a bank account](#connect:bank)
Support:       [Contact support](#navigate:/account/support)
```

The renderer intercepts them:

```ts
export const ENTITY_LINK_RE = /^#(txn|inv|cust|project|inbox|doc|connect|navigate):/;
// streamdown-config.tsx
a: ({ href, children }) => {
  if (href && ENTITY_LINK_RE.test(href)) {
    return <button onClick={() => onEntityLink(href)}>{children}</button>;
  }
  return <Link href={href ?? "#"}>{children}</Link>;
}
```

So an answer is navigable. "You spent 50,000 at Warung Tekko" becomes a click that opens that transaction. It costs a regex and a prompt block, and it turns the assistant from a reader into an index.

### 1.6 Tool call presentation

Tool calls are not dumped as JSON. Every tool name maps to a human label:

```ts
const TOOL_LABELS = {
  transactions_list: "Looking up transactions",
  invoices_send: "Sending invoice",
  reports_burn_rate: "Calculating burn rate",
};
```

With a fallback that derives a label from the name shape (`noun_verb` to gerund plus noun), so a new tool reads correctly before anyone writes a label for it.

The UI collapses them. One finished tool shows a check and its label. Several finished tools collapse to "Used 4 tools", expandable. The in-flight tool shows a shimmer on the current label. `search_tools` is in `HIDDEN_TOOLS` and never shown, because the selector is plumbing, not progress.

Text that arrives before the last tool call is dropped while tools are still running, so the model's intermediate narration never reaches the screen. That is `parseAssistantMessage` in `chat-utils.ts`, and it is what makes the prompt rule "do not narrate each tool call" actually hold.

### 1.7 Cache invalidation after a tool write

The problem: the assistant writes a transaction, and the table the user switches back to is stale. Midday solves it with a tool-name to invalidation map, deduped by `toolCallId`:

```ts
const TOOL_INVALIDATION_MAP = {
  transactions_create: invalidateTransactions,
  transactions_update: invalidateTransactions,
  inbox_match_transaction: (trpc, qc) => { invalidateInbox(trpc, qc); invalidateTransactions(trpc, qc); },
};
```

`invalidateTransactions` invalidates not only the transaction list but every report derived from it: revenue, profit, expense, spending, tax summary, forecast, overview. A write to one table invalidates its whole derived surface. The hook walks the message list, skips tool calls it has already handled, and fires once per batch.

### 1.8 Token discipline in tool results

Tool results are reshaped before they reach the model. The database row is not what the model sees: `mcpTransactionSchema` is a flat, compact projection, and `sanitize` maps a row onto it. Lists are then truncated to a byte budget:

```ts
while (data.length > 1 && text.length > MCP_TEXT_LIMIT) {
  data.pop();
  text = JSON.stringify({ ...response, meta: { ...meta, hasNextPage: true, truncated: true, returnedItems: data.length }, data });
}
```

The model is told the result was truncated rather than silently receiving half a page.

---

## 2. The canvas

This is the finding that most changes how oewang should build its own.

**Midday's canvas is not an artifact renderer.** There is no custom schema, no generated chart spec, no model-authored UI. It is the real invoice editor, mounted in a side panel:

```tsx
// chat-invoice-canvas.tsx, 90 lines total
<FormContext defaultSettings={defaultSettings} data={data}>
  {invoiceType === "success" ? <InvoiceSuccess /> : <Form />}
</FormContext>
```

`<Form />` is the same component the Invoices page uses. The canvas wrapper does three things: animate a 650 px panel in from the right, suspend while the invoice loads, and reset the editor store when the invoice ID changes.

State lives in the URL, through `useInvoiceParams` (nuqs):

```tsx
const handleInvoiceUpdate = useCallback((invoiceId: string) => {
  useInvoiceEditorStore.getState().reset();
  setInvoiceParams({ canvas: true, invoiceId });
}, [setInvoiceParams]);
```

The chat column animates its own margin so the conversation reflows rather than being covered:

```tsx
<motion.div animate={{ marginRight: isCanvasOpen ? 650 : 0 }} transition={canvasSpring} />
```

Consequences worth copying:

- The canvas can never drift from the real editor, because it is the real editor.
- Edits made in the canvas go through the normal form path, normal validation, normal mutation.
- The model does not render anything. It creates a draft and says one sentence. The prompt enforces the silence.
- A canvas URL is shareable and survives reload.

The old oewang implementation went the other way: a bespoke canvas artifact system with its own chart components under `components/organisms/chat/canvas/` and `charts/`, fed by model-produced artifact payloads. Midday's approach is strictly less code and strictly more correct.

---

## 3. Transaction import

### 3.1 The CSV path: the model maps columns, never rows

This is the single best idea in the repository for oewang.

`buildCsvMappingPrompt(fieldColumns, firstRows)` sends the model the column names and **two** sample rows, each cell clamped to 80 characters. It asks for one thing: a mapping from CSV columns to six target fields (`date`, `description`, `counterparty`, `amount`, `balance`, `currency`).

```
<rules>
1) Return only exact CSV column names for mapped fields.
2) If no matching column exists, omit that field.
3) Never invent column names.
6) counterparty = the other party: merchant, vendor, payee, payer, recipient.
   NEVER use Cardholder, Account Holder, Name, Customer, or similar columns
   that identify the account owner. Those are the user, not the counterparty.
7) Do not map both description and counterparty to the same column.
</rules>
```

Three few-shot examples follow, one of them specifically teaching the Cardholder trap.

Then **every row is transformed by deterministic code**. The model never sees an amount, never produces an amount, and cannot shift a decimal point. Cost is one small call per file regardless of whether the file has 10 rows or 10,000.

Date parsing is deterministic too, with a fast ISO path that avoids a UTC conversion shifting the date, and `chrono-node` as the fallback for everything else.

### 3.2 Deterministic deduplication

Every imported row gets a content fingerprint:

```ts
const fingerprint = [bankAccountId, formattedDate, String(formattedAmount), currency, description, counterparty]
  .map(normalize).join("|");
const internal_id = `${teamId}_${sha256(fingerprint).slice(0, 24)}`;
```

Normalization lowercases, trims and collapses whitespace. The ID is a natural key, so re-importing the same statement is a no-op rather than a doubled ledger. There is no "have I imported this before" dialog, because the question cannot arise.

### 3.3 Validation is a filter, not a gate

`validateTransactions` parses every row with Zod and returns `{ validTransactions, invalidTransactions }`. Bad rows are separated, not thrown. A single malformed row never fails a file.

### 3.4 The document path: a quality ladder, not one big call

For receipts and invoices, `packages/documents` runs a four-pass pipeline with a model cascade:

```ts
models: {
  primary:   { provider: "mistral", model: "mistral-small-latest" },
  secondary: { provider: "google",  model: "gemini-3-flash-preview" },
  tertiary:  { provider: "google",  model: "gemini-3-pro-preview" },
},
qualityThreshold: 70,
criticalFields: ["total_amount", "currency", "vendor_name", "invoice_date", "due_date"],
fieldPriority: { total_amount: 10, currency: 10, vendor_name: 9, /* … */ notes: 1 },
```

| Pass | What happens |
|---|---|
| 1 | Primary (cheapest) model. Compute a quality score from critical fields and field priority. If the score is good, stop |
| 2 | Secondary model with a chain-of-thought prompt. Merge the two results field by field, weighted by per-result confidence |
| 3 | Re-extract **only the specific fields** still missing or invalid, with the secondary model |
| 4 | Cross-field consistency validation, in code, with arithmetic fixes |

Pass 4 is the one that deserves copying literally. It is pure TypeScript, no model:

```ts
// subtotal from line items + tax ≈ total
const calculatedTotal = subtotal + result.tax_amount;
if (Math.abs(calculatedTotal - result.total_amount) > 0.01) {
  issues.push({ field: "total_amount", severity: "error", issue: "…" });
  suggestedFixes.push({ field: "total_amount", value: calculatedTotal, reason: "…" });
}
```

A vision model misreading a digit in a total is common. Arithmetic over the line items catches it without another model call.

There is also graceful degradation around all of it: a document always reaches a usable state even when classification fails, `pending` for more than 10 minutes is treated as stale and offers a retry, and jobs are deduplicated by deterministic job ID.

---

## 4. Receipt to transaction matching

`docs/inbox-matching.md` describes a feature oewang does not have and should eventually want: a receipt uploaded to the inbox is automatically matched to the bank transaction it belongs to.

The headline finding is what they did **not** use:

> The current algorithm is **embedding-free for inbox matching**.

Retrieval is SQL-first: team-bounded, date-windowed, `pg_trgm` `word_similarity` on names, amount proximity in the same currency or in a shared base currency. Ranking is a hand-written scorer over `nameScore`, `amountScore`, `currencyScore` and `dateScore`, with guarded adjustments for exact-amount matches and a zero-name penalty.

On top of that, three learning layers that are all plain tables, not models:

1. **Alias memory.** Repeated confirmations of a `(receiptName, transactionName)` pair boost that pair's name score for that team. This is how "PT Sumber Alfaria Trijaya" learns to match "ALFAMART".
2. **Hard-negative memory.** Declines and unmatches become a time-decayed penalty. Recent negatives weigh more, confirmations offset them, the penalty is capped so a match can recover.
3. **Dismissal protection.** An exact pair the user dismissed is never suggested again.

Thresholds are calibrated **per team** from recent labelled outcomes, with a threshold sweep blended with heuristics, producing separate auto-match and suggest thresholds.

The lesson generalizes past matching: a deterministic scorer with a feedback table beats an embedding when the signals are strong and the result must be explainable.

---

## 5. Insights: the model writes prose, never numbers

`docs/weekly-insights.md` describes a weekly summary feature. Its architecture is a rule oewang should adopt wholesale.

Every number is computed in code first and placed in a **slot**, already formatted as a string:

```ts
type InsightSlots = {
  profit: string;                    // "117,061 kr"
  profitRaw: number;                 // 117061
  margin: string;                    // "97.4"
  runway: number;                    // 8
  runwayExhaustionDate?: string;     // "March 3, 2026"
  profitChange: number;              // 96
  profitDirection: "up" | "down" | "flat";
  profitChangeDescription: string;   // pre-computed semantic description
  weekType: "great" | "good" | "quiet" | "challenging";
};
```

The model receives slots and writes sentences. Four focused prompts (title, summary, actions, story) instead of one, three of them running in parallel against slots alone, the fourth taking the first two as context.

The model does no arithmetic, no comparison, no rounding, no currency formatting, and no trend classification. All of that is code, and all of it is testable without a model.

---

## 6. Things Midday has that oewang deliberately will not

Recorded so nobody reads this document and concludes the gap is accidental.

| Midday feature | oewang |
|---|---|
| `web_search` in chat | Deliberately absent. It is an exfiltration path for an injected instruction ([AI safety](../security/ai-safety.md#what-is-deliberately-not-built)) |
| Composio connected apps (Gmail, Slack, Notion) | Out of scope, and it would widen the blast radius of a prompt injection far past the ledger |
| MCP servers for ChatGPT and Claude | Out of scope ([PRD non-goals](../prd.md#non-goals-for-v1)) |
| Bank connections, invoices, time tracking, customers | Out of scope |
| Desktop app, CLI, app store | Out of scope |
| Trigger.dev and BullMQ | One async job, run as a tokio task (D10) |

Midday's trust model is also looser than the one oewang committed to. Its tool scopes are real, but nothing in the chat path caps writes per turn, and the destructive-action gate is a prompt rule ("ask for confirmation") rather than a server-side challenge. oewang's [AI safety](../security/ai-safety.md) controls are stricter on purpose, and nothing in this document should be read as a reason to loosen them.

---

## 7. Proposals

Each proposal carries a verdict. Adopted ones have a decision in the [log](../architecture.md#decision-log).

### Adopt now

| # | Proposal | Why | Cost |
|---|---|---|---|
| **P1** | CSV import: one cheap model call that maps **columns**, with two clamped sample rows. All rows transformed by deterministic code. Few-shot the counterparty trap | Removes the entire class of "the model misread an amount". One call per file at any row count | Small. One prompt, one schema, reuse of the existing wizard as the confirm step |
| **P2** | Deterministic import fingerprint as a natural key: `sha256(wallet, date, amount, currency, name, counterparty)`, unique per workspace | Re-importing a statement becomes a no-op instead of a doubled ledger. Today oewang has nothing stopping that | Small. One column, one unique index, one hash |
| **P3** | The model never does arithmetic. Every number is computed in Rust, formatted, and handed to the model as a slot | A finance assistant that computes its own totals will eventually be confidently wrong. This is the rule that prevents it | Small, and it shrinks prompts |
| **P4** | Cross-field consistency fixes on every extraction: line items sum to subtotal, subtotal plus tax equals total, date sanity. Code, not a model | Catches the most common vision-model error without another call | Small. One pure function with tests |
| **P5** | Tool-name to cache-invalidation map in the web app, deduped by tool call ID, invalidating the derived surface as well as the table | oewang has no realtime channel, so a chat write leaves every other view stale | Small |
| **P6** | Entity deep links in assistant output: `[Name](#txn:ID)`, intercepted by the Markdown renderer | Turns the assistant from a reader into an index. Fits the sanitizer rule already specified | Small. One regex, one prompt block, one renderer override |
| **P7** | Compact tool-result projection plus byte-budget truncation that sets `truncated: true` | Database rows are the wrong shape and the wrong size for a model. Direct token cost | Small |
| **P8** | Human tool labels with a derived fallback, collapsed tool groups, hidden plumbing tools, and suppression of intermediate narration | The difference between a chat that feels like a product and one that feels like a log | Small, mostly UI |
| **P9** | Precomputed date context in the system prompt: today, quarter, month start, quarter start, year start, in the workspace timezone | Removes date arithmetic from the model, which is P3 applied to dates | Trivial |
| **P10** | Prompt rules: never invent a number, ISO 8601 for every tool parameter, user format for display only, markdown table for three or more items | Each one fixes a specific bug class seen in the old oewang chat | Trivial |
| **P11** | Canvas is the real component in a side panel, driven by URL params. No artifact schema, no model-authored UI | Less code than a bespoke canvas and it cannot drift from the real editor. The old oewang canvas was the opposite choice and cost more | Medium, and it replaces work already planned |
| **P12** | Graceful degradation on the import job: a stale `pending` past 10 minutes offers a retry, a failed job keeps the file and is retryable | A stuck job currently has no escape hatch in the plan | Small |
| **P13** | Extraction quality ladder: cheap model first, computed quality score, escalate only when the score is poor, then targeted re-extraction of only the bad fields | Most receipts are easy. Paying for the most capable model on every upload is waste, and escalating on evidence keeps the worst case intact. Adopted on 2026-11-02 at the owner's request (D36) | Medium. One scorer, one merge function, one loop. oewang adds a wall-clock budget Midday does not need, because its extraction is asynchronous and oewang's is not |

### Adopt later, needs a decision

| # | Proposal | Why not now |
|---|---|---|
| **P14** | Receipt to transaction matching, with a deterministic scorer, alias memory, hard-negative memory and per-workspace calibrated thresholds | A feature, not a refinement. It is the natural v2 of receipt capture and deserves its own PRD |
| **P15** | Periodic insight summaries built on the slots pattern | Out of scope for v1. P3 lands the rule now, so the feature is cheap later |
| **P16** | A single tool registry that serves both the chat and a future external integration | oewang has no external tool consumer. The DRY benefit is zero until it does. Keep the tool schemas in one module so the move is mechanical |

### Reject

| # | Proposal | Why |
|---|---|---|
| **P17** | Embedding-based tool selection (`toolpick`) | It solves a problem of scale oewang does not have. Midday needs it at roughly 90 tools. oewang has 11, and all of them fit in a prompt. Revisit past roughly 25 tools |
| **P18** | `web_search` and external app tools in chat | Rejected on security grounds, not scope. Both give an instruction injected into a receipt a path to the network ([AI safety](../security/ai-safety.md#what-is-deliberately-not-built)). Midday accepts that risk. oewang does not |

---

## 8. What this changes in the plan

Adopted proposals land as follows. Full detail in the linked docs.

| Proposal | Lands in |
|---|---|
| P1, P2, P12 | [Transactions](../features/transactions.md#import), [data model](../data-model.md#transactions), [AI service](../ai/service.md#csv-column-mapping), US-022 and US-035 |
| P3, P9, P10 | [AI service](../ai/service.md#system-prompt), [chat](../features/chat.md) |
| P4 | [AI service](../ai/service.md#receipt-and-statement-parsing), US-033 |
| P13 | [AI service](../ai/service.md#extraction-quality-ladder), US-033b |
| P5, P6, P8 | [Chat](../features/chat.md#entity-deep-links), US-031 |
| P7 | [AI service](../ai/service.md#tool-result-shape), US-029 |
| P11 | [Chat](../features/chat.md#canvas), US-034 |

## Related docs

- [Docs index](../README.md) and [PRD](../prd.md)
- [Architecture decision log](../architecture.md#decision-log)
- [Chat](../features/chat.md) and [AI service](../ai/service.md)
- [Transactions](../features/transactions.md)
- [AI safety](../security/ai-safety.md)
- [Legacy app](../reference/legacy-app.md), the other reference implementation
