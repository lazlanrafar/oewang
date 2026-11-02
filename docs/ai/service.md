# AI Service

Status: draft v0.1, 2026-11-02. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md) PLT-3, CHAT-3 to CHAT-7 and AI-1 to AI-6.

`apps/ai` is a Python 3.13 FastAPI service on port 3004. It owns every call to the model and nothing else.

## Update this doc when

- Adding, removing or changing a tool, including its schema.
- Changing the system prompt structure.
- Changing the streaming event protocol.
- Changing the model IDs or the loop limits.

## Responsibilities

Owns:

- System prompt construction.
- The Claude tool loop.
- Server-sent event streaming.
- Receipt OCR and bank statement extraction.
- Session title generation.

Owns nothing else. It has no database connection, no storage credentials and no user JWT (D3, D4). Every side effect goes through the API's internal endpoints.

The practical test: if `apps/ai` had `DATABASE_URL` set, it would be a bug. The deployment does not provide one.

## Stack

| Concern | Choice |
|---|---|
| Runtime | Python 3.13, `uv` for dependency management. `requires-python` is >=3.12 |
| Framework | FastAPI, served by uvicorn |
| Model client | The Anthropic Python SDK (A1) |
| Chat model | `AI_CHAT_MODEL`, default `claude-sonnet-5-5` |
| Vision models | A three-step ladder, see [extraction quality ladder](#extraction-quality-ladder). `AI_VISION_PRIMARY` defaults to `claude-haiku-5-5`, `AI_VISION_SECONDARY` to `claude-sonnet-5-5`, `AI_VISION_TERTIARY` to `claude-opus-5` |
| HTTP client | `httpx`, async, for calls back to the API |
| Validation | Pydantic models on every request and response |
| Lint and format | `ruff` |
| Tests | `pytest`, with the model always mocked |

## Endpoints

Every route requires `x-api-key`. There is no user-facing authentication here (D4).

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness |
| POST | `/chat/stream` | Tool-loop chat, answers `text/event-stream` |
| POST | `/chat/title` | Short session title from the first user message |
| POST | `/receipt/parse` | Image bytes to a structured receipt draft |
| POST | `/import/map-columns` | Column names plus two sample rows to a column mapping (D28) |
| POST | `/import/extract` | Statement image or PDF to structured transaction rows |
| GET | `/tools/definitions` | The tool schemas, so the API can validate against the same contract |

### `POST /chat/stream` request

```json
{
  "workspace_id": "clx…",
  "user_id": "clx…",
  "role": "admin",
  "session_id": "clx…",
  "message": "How much did I spend on food last month?",
  "history": [ { "role": "user", "content": "…" }, { "role": "assistant", "content": "…" } ],
  "context": {
    "currency_code": "IDR",
    "today": "2026-11-02",
    "wallets": [ { "id": "clx…", "name": "Cash", "balance": "250000.0000", "is_default": true } ],
    "categories": [ { "id": "clx…", "name": "Food", "type": "expense" } ]
  },
  "settings": { "custom_instructions": null, "response_language": "auto" },
  "attachments": [ { "vault_file_id": "clx…", "type": "image/jpeg", "url": "https://…" } ]
}
```

The workspace context is supplied by the API (CHAT-7). The service does not fetch it unless a tool asks for a refresh mid-turn.

## Tool catalog

Eleven tools (D17), cut down from thirty-four in the old app. Schemas live in one Python module and are exposed at `GET /tools/definitions`, so the API validates against the same definitions the model sees.

### Read tools

| Tool | Arguments | Returns |
|---|---|---|
| `get_workspace_context` | none | Wallets and categories. Rarely needed; the prompt already carries them. Use after creating a wallet mid-turn |
| `get_recent_transactions` | `limit` (1 to 50), `from`, `to` | Recent transactions, newest first |
| `search_transactions` | `query`, `type`, `category_id`, `wallet_id`, `min_amount`, `max_amount`, `from`, `to`, `limit` | Matching transactions |
| `get_spending_summary` | `from`, `to`, `group_by` (`category`, `wallet`, `type`, `month`) | Totals per group, with a grand total |

### Write tools

| Tool | Arguments | Role |
|---|---|---|
| `create_transaction` | `type`, `amount`, `wallet_id`, `to_wallet_id`, `category_id`, `date`, `name`, `description` | admin+ |
| `update_transaction` | `transaction_id` plus any creatable field | admin+ |
| `delete_transaction` | `transaction_id`, `confirmed` | admin+, plus confirmation (CHAT-6) |
| `add_transaction_items` | `transaction_id`, `items[]` | admin+ |
| `create_wallet` | `name`, `group_id`, `initial_balance` | admin+ |
| `create_category` | `name`, `type` | admin+ |

### Interaction tool

| Tool | Arguments | Purpose |
|---|---|---|
| `present_choices` | `question`, `choices[]` | Ask the user to disambiguate a wallet, a category or a date instead of guessing |

Required arguments, types and enums are in the schema module. Money arguments are strings, matching the wire format (D12).

### What was dropped

From the old app's thirty-four tools: everything for debts (4), contacts (4), budgets (3), wallet groups (3), documents (4), bill splitting (1), export (1), recall (1), receipt re-send (1), plus eleven analysis tools that produced canvas artifacts. All belong to features out of scope ([PRD non-goals](../prd.md#non-goals-for-v1)).

## The arithmetic rule

**The model never does arithmetic** (D27). Every number it states has been computed in Rust, rounded, formatted and handed to it as a prepared value.

This applies to totals, differences, percentages, averages, date ranges, currency formatting and trend classification. A tool that answers "how much did I spend on food last month" returns the total already formatted, the comparison with the previous month already computed, and the direction already labelled `up`, `down` or `flat`. The model picks words.

The reason is not model capability. It is that a model's arithmetic error looks exactly like a correct answer, and a finance tool cannot carry that risk. The pattern is taken from Midday's insight pipeline, which precomputes every figure into a slot before any prompt runs ([research](../research/midday.md#5-insights-the-model-writes-prose-never-numbers)).

Consequences:

- `get_spending_summary` returns formatted strings alongside raw decimals, plus a precomputed comparison and direction.
- Prompts get shorter, because they carry no instructions about how to round or format.
- Every figure is testable without a model.

## System prompt

Assembled per turn, in this order:

0. **Date context, precomputed** in the workspace timezone (D27, P9). The model never derives a quarter boundary:

```
- Today: 2026-11-02 (Q4 2026)
- This month: 2026-11-01 to 2026-11-02
- This quarter: 2026-10-01 to 2026-11-02
- This year: 2026-01-01 to 2026-11-02
- Timezone: Asia/Makassar
- Currency: IDR
```

1. **Role.** What the assistant is: a finance assistant for this workspace, in this currency, today's date.
2. **Capability line.** What the caller may do, derived from `role`. For a `member`: read and answer only, writes will be refused.
3. **Accounts and categories.** The workspace's wallets with balances, and categories by type. This is the block that makes `get_workspace_context` rarely necessary (CHAT-7).
4. **Rules.** In this order, because the first one is the one that matters:
   - **Never invent or guess a number, amount, date, name or ID.** Every figure comes from a tool result.
   - Use the IDs given. Ask with `present_choices` rather than guessing a wallet or a category.
   - **ISO 8601 for every tool parameter.** The workspace date format is for display only, never for a tool argument.
   - Amounts are strings, never numbers.
   - Three or more items render as a Markdown table. One or two render as bullets.
   - Entity names are clickable links in the scheme below.
   - Never claim a write succeeded unless the tool result says so.
   - Do not narrate intermediate tool calls. Present the result once the work is done.
5. **Confirmation rule.** Destructive tools need a separate confirming turn (D20).
6. **Language rule.** From `response_language`: match the user, or force English, or force Indonesian.
7. **Custom instructions.** The workspace's own text, if any (CHAT-10).

8. **Entity link scheme** (D33). The model writes these, the web app intercepts them:

```
Transactions: [Name](#txn:TRANSACTION_ID)
Wallets:      [Cash](#wallet:WALLET_ID)
Categories:   [Food](#cat:CATEGORY_ID)
Receipts:     [receipt.jpg](#file:FILE_ID)
Navigation:   [Settings](#navigate:/settings)
```

The prompt is built in one module with one function, so a change is one diff and one test.

## Tool result shape

A database row is the wrong shape and the wrong size for a model (D34). Before a result leaves the API it is projected onto a compact schema: flat, no nulls that carry no meaning, names resolved instead of foreign keys.

```json
{
  "id": "clx…",
  "date": "2026-11-02",
  "name": "Warung Tekko",
  "amount": "50000.0000",
  "currency": "IDR",
  "type": "expense",
  "wallet": { "id": "clx…", "name": "Cash" },
  "category": { "id": "clx…", "name": "Food" },
  "is_ready": true
}
```

Lists are truncated to a byte budget. When truncation happens, the result says so explicitly rather than silently returning less:

```json
{ "data": [ … ], "meta": { "returned": 18, "has_next_page": true, "truncated": true } }
```

A model told its result was truncated asks for the next page. A model handed a quietly shortened list reports a wrong total.

## Streaming protocol

`text/event-stream`. One JSON object per `data:` line. The API and SvelteKit pass these through unchanged; only the chat UI parses them.

| Event | Payload | Meaning |
|---|---|---|
| `token` | `{"text": "You spent "}` | A chunk of assistant text |
| `tool_call` | `{"id": "t1", "name": "get_spending_summary", "args": {…}}` | The model asked for a tool |
| `tool_result` | `{"id": "t1", "ok": true, "summary": "6 categories"}` | The API answered |
| `receipt_draft` | `{"draft": {…}}` | A parsed receipt, pending confirmation |
| `done` | `{"message_id": "clx…", "usage": {"input": 1204, "output": 311}}` | Turn complete |
| `error` | `{"code": "TOOL_FAILED", "message": "…"}` | Failure after the stream opened |

Rules:

- `done` or `error` always arrives last. A stream never ends silently.
- An error before the stream opens uses the normal JSON envelope instead ([conventions](../api/conventions.md#streaming)).
- Buffering is disabled at every hop, including uvicorn and any reverse proxy.

## The tool loop

```
build the system prompt
messages = history + user message
for round in 1..AI_MAX_STEPS:          # default 8 (CHAT-5)
    response = claude(messages, tools=TOOLS)
    stream any text as token events
    if no tool calls:
        break
    for each tool call:
        emit tool_call
        result = POST api /v1/internal/tools/execute
        emit tool_result
        append the result to messages
emit done
```

Safety rules:

- **Round cap.** On hitting `AI_MAX_STEPS`, the loop stops and returns what it has rather than looping (CHAT-5).
- **Blast-radius caps.** The API refuses more than 3 write calls, more than 1 delete, or more than 3 created transactions in one turn (D25, SEC-23). The service relays the refusal.
- **Tool errors are data.** A refusal or a failure is appended as a tool result, so the model can explain it. It is never raised as an exception that kills the turn.
- **No retry on refusal.** `TOOL_FORBIDDEN` and `CONFIRMATION_REQUIRED` are relayed to the user, not worked around.
- **No client-side authorization.** The service never decides that a call is allowed. It asks the API and reports the answer.
- **Bounded history.** A long conversation is truncated to a bounded window before it is sent, so cost per turn does not grow without limit.

## CSV column mapping

The cheapest and most reliable part of import (D28, AI-9). The model is shown the **column names** and two sample rows, each cell clamped to 80 characters. It returns a mapping and nothing else.

```json
{
  "columns": ["Tanggal", "Keterangan", "Debet", "Kredit", "Saldo"],
  "sample_rows": [
    {"Tanggal": "02/11/2026", "Keterangan": "WARUNG TEKKO", "Debet": "50.000", "Saldo": "1.200.000"}
  ]
}
```

Returns:

```json
{ "date": "Tanggal", "name": "Keterangan", "amount_out": "Debet", "amount_in": "Kredit", "balance": "Saldo" }
```

Rules in the prompt, with few-shot examples for each:

1. Return only exact column names from the input. Never invent one.
2. Omit a field when no column matches.
3. `name` is the transaction text, memo or merchant.
4. `counterparty` is the other party: merchant, vendor, payee, recipient. **Never** a column that names the account holder (`Nama Pemilik`, `Cardholder`, `Account Holder`). That is the user, not the counterparty.
5. Never map two fields to the same column.
6. For currency, return a column name if one exists, otherwise an inferred ISO 4217 code.

**Every row is then transformed by deterministic Rust code.** The model never sees an amount, never produces an amount, and cannot move a decimal point. Cost is one small call per file whether the file has 10 rows or 10,000.

Indonesian bank statements split debit and credit into two columns, which the old app's row-extraction approach handled by asking the model to infer direction per row. Column mapping handles it once, as a mapping, and the sign rule lives in code.

## Receipt and statement parsing

| Endpoint | Models | Tools | Output |
|---|---|---|---|
| `POST /receipt/parse` | [ladder](#extraction-quality-ladder) | none | merchant, date, total, currency, line items, quality score |
| `POST /import/extract` | [ladder](#extraction-quality-ladder) | none | rows of date, description, amount, direction, quality score |

A PDF carrying a real text layer skips the model entirely on the first attempt: the text is extracted and parsed deterministically, and vision runs only when that yields nothing usable (D42). Reading a PDF's own text is cheaper and more accurate than looking at a picture of it, and it is the same principle as the ladder: escalate on evidence.

**Both calls pass no tools at all** (D24, SEC-21). The input is attacker-controlled text, so the component that reads it is given nothing to call. An instruction printed on a receipt reaches a model that has no `create_transaction` and no `delete_transaction` to reach for. This is the strongest control in the feature; see [AI safety](../security/ai-safety.md).

Both use a strict output schema and validate the result with Pydantic before returning it. A result that fails validation is retried once with a stricter instruction, then returns `RECEIPT_UNREADABLE` or `STATEMENT_UNREADABLE` (AI-3). Neither endpoint writes anything anywhere.

`/import/extract` is used only for an image or a PDF. Anything with columns goes through [column mapping](#csv-column-mapping) instead, because deterministic beats model-driven whenever structure exists.

## Extraction quality ladder

Most receipts are easy. A clear photograph of a supermarket receipt does not need the most capable model, and paying for one on every upload is waste. A crumpled thermal receipt photographed at an angle does need it.

So extraction starts cheap and escalates only on evidence (D36, AI-10). Adapted from Midday's four-pass engine ([research](../research/midday.md#34-the-document-path-a-quality-ladder-not-one-big-call)), with Claude as the single provider (D11) and a wall-clock budget added, because oewang's receipt flow is synchronous and a user is watching.

### The passes

| Pass | Model | What it does | Exit condition |
|---|---|---|---|
| 1 | `AI_VISION_PRIMARY` | Extract with the standard prompt. Score the result | Score at or above the threshold: return |
| 2 | `AI_VISION_SECONDARY` | Re-extract with a chain-of-thought prompt. Merge the two results field by field, weighted by confidence. Re-score | Score now at or above the threshold: return |
| 3 | `AI_VISION_SECONDARY` | Re-extract **only** the fields still missing or invalid, one targeted prompt per field. Merge back | Always continues to pass 4 |
| 4 | none | [Cross-field consistency](#cross-field-consistency) in Rust: arithmetic fixes, date and currency sanity (D30) | Final result |

`AI_VISION_TERTIARY` is used in pass 2 instead of the secondary when pass 1 scored below half the threshold, meaning the primary model did not produce something worth merging with. There is no separate fourth model call.

Most uploads stop at pass 1.

### Quality score

A single number from 0 to 100. Start at 100 and deduct per field, weighted by how much the field matters. Threshold is 70, configurable as `AI_QUALITY_THRESHOLD`.

Receipts:

| Field | Missing | Present but invalid |
|---|---|---|
| `total_amount` | -30 | -15 |
| `currency` | -25 | -10 |
| `merchant` | -20 | n/a |
| `date` | -15 | -5 (bad format or outside a reasonable range) |
| `line_items` | -10 | -5 (items do not sum close to the total) |

Statement rows score on the batch: a row missing a date or an amount is invalid, and the score is the share of valid rows.

The weights are deliberate. A receipt with no merchant name is still useful, because the user can type it. A receipt with no total is not a receipt.

### Merging two results

Pass 2 produces a second result, not a replacement. Merge rules, in order:

1. A field present in one result and absent in the other: take the present one.
2. Both present and the confidences differ by more than 0.1: take the higher-confidence result's value.
3. Both present and the confidences are close: field-specific rules decide. For `total_amount`, prefer the value that agrees with the sum of the line items. For `date`, prefer the one inside a reasonable range. For `merchant`, prefer the longer string, because truncation is the common failure.
4. `line_items`: take the longer list, then apply consistency fixes to it.

Confidence is derived from the result's own quality score and its missing critical fields, so it is computed, not asked for from the model.

### Budget and caps

The ladder cannot run forever. A user is waiting on a confirmation sheet.

| Limit | Value | Behaviour on breach |
|---|---|---|
| Model calls per document | 2 full passes plus at most 4 targeted field calls | Stop and return what exists |
| Wall clock per document | 45 seconds, `AI_EXTRACTION_BUDGET_MS` | Stop at the current pass and return |
| Per-call timeout | 20 seconds | Count as a failed pass, continue the ladder |

When the budget runs out mid-ladder, the result is returned with its score, marked low confidence. It is not an error: a partially extracted receipt the user can correct beats a spinner that ends in a failure message.

`RECEIPT_UNREADABLE` (AI-3) is returned only when the result after pass 4 still has no `total_amount` and no `date`. Below the threshold but with those two present, the draft is returned and marked (AI-11), and the confirmation sheet highlights the weak fields for the user to check.

A failed pass never aborts the ladder. Pass 2 failing falls through to pass 3; pass 3 failing falls through to pass 4.

### What the user sees

The draft carries its score and a per-field flag:

```json
{
  "draft": { "merchant": "Warung Tekko", "total": "87500.0000", "date": "2026-11-02", "line_items": [ … ] },
  "quality": { "score": 62, "low_confidence_fields": ["date"], "corrected_fields": ["total"] }
}
```

The confirmation sheet marks a `low_confidence_field` for attention and a `corrected_field` as replaced by arithmetic ([chat](../features/chat.md#canvas)). The user always sees which numbers the model gave and which the code fixed.

### Cross-field consistency

Extraction output passes through consistency checks before anyone sees it (D30, AI-7). These are pure Rust functions in the API, not a model call:

| Check | Fix |
|---|---|
| Line items sum to the stated subtotal | Difference over 0.01 raises an issue and suggests the computed subtotal |
| Subtotal plus tax equals the total | Difference over 0.01 suggests the computed total |
| Unit price times quantity equals the item amount | Suggests the computed amount |
| Date is a real calendar date, not in the future beyond today | Clears an impossible date rather than guessing |
| Currency is a valid ISO 4217 code | Falls back to the workspace currency |

A suggested fix is applied and the field is marked as corrected, so the confirmation sheet can show the user which values the model gave and which arithmetic replaced. A vision model misreading one digit in a total is the most common receipt failure, and summing the line items catches it for the cost of a function call ([research](../research/midday.md#34-the-document-path-a-quality-ladder-not-one-big-call)).

## Observability

- Structured JSON logs with `request_id` propagated from the API.
- Logged per turn: workspace ID, session ID, round count, tool names called, input and output tokens, total duration.
- Logged per extraction: the pass reached, the model used at each pass, the quality score after each pass, the fields re-extracted, and total duration. This is the data that says whether the ladder's threshold is set correctly, and whether the primary model is good enough to stay primary.
- Never logged: prompt text, message content, receipt images, extracted receipt text, the Anthropic key (OPS-3).

Token usage is logged for cost visibility. There is no quota enforcement; billing is out of scope.

## Testing

| Kind | Approach |
|---|---|
| Tool loop | A fake model client returns a scripted sequence: one call, a chain, a refusal, a cap breach |
| Prompt | Golden-file test on the assembled prompt for a fixed context |
| Schemas | `GET /tools/definitions` matches the schema module, so the API and the model cannot drift |
| Parsing | Three receipt fixtures with known totals and dates, run against a recorded response |
| Quality score | Pure function, no model. A complete receipt scores 100, each missing field deducts its stated weight |
| Ladder | A scripted model client: a clean result stops at pass 1 and makes exactly one call; a poor result escalates; a pass 2 failure still reaches pass 4; the call cap and the time budget both stop the ladder and return a marked result |
| Merging | Two results with known confidences merge per the stated rules, including the close-confidence field rules |
| Auth | A request without `x-api-key` is rejected |

No test calls the real model. Model-dependent quality is judged by hand against the fixtures.

## Related docs

- [Docs index](../README.md) and [PRD](../prd.md)
- [Chat feature](../features/chat.md)
- [AI safety](../security/ai-safety.md): prompt injection, blast radius, the test corpus
- [Payload encryption](../api/encryption.md): the service hop is encrypted too
- [API endpoints](../api/endpoints.md#internal) and [conventions](../api/conventions.md)
- [Architecture](../architecture.md#chat-stream) and the [decision log](../architecture.md#decision-log)
- [Auth and access control](../security/auth.md#service-to-service)
- [Legacy app](../reference/legacy-app.md#where-to-look-when-porting)
