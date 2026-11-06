# AI Service

Status: draft v0.2, 2026-11-03. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md) PLT-3, CHAT-3 to CHAT-7 and AI-1 to AI-11.

`apps/ai` is a Python 3.13 FastAPI service on port 3004. It owns every call to the model and nothing else.

## Update this doc when

- Adding, removing or changing a tool, including its schema.
- Changing the system prompt structure.
- Changing the streaming event protocol.
- Changing the model IDs or the loop limits.
- Changing what a request must carry: the service key, the rate limits or the OWE1 contract.
- Changing the quality score's weights, the ladder's passes, its caps or its merge rules.
- Changing the shape of an extraction response, or the fields a column mapping may name.

## Responsibilities

Owns:

- System prompt construction.
- The Claude tool loop.
- Server-sent event streaming.
- Receipt OCR and bank statement extraction, including the quality ladder and the CSV column mapping.

Owns nothing else. It has no database connection, no storage credentials and no user JWT (D3, D4). Every side effect goes through the API's internal endpoints.

The practical test: if `apps/ai` had `DATABASE_URL` set, it would be a bug. The deployment does not provide one, and the service refuses to start if it finds one. The same applies to `JWT_SECRET`, `S3_SECRET_ACCESS_KEY` and `RESEND_API_KEY`: they live in the shared `.env` for the API's sake, the compose file drops them from this container, and the startup check is what makes that structural rather than a convention.

## Stack

| Concern | Choice |
|---|---|
| Runtime | Python 3.13, `uv` for dependency management. `requires-python` is >=3.12 |
| Framework | FastAPI, served by uvicorn |
| Model client | The Anthropic Python SDK (A1), pointed at `AI_BASE_URL` when a gateway is configured (D67) |
| Chat model | `AI_CHAT_MODEL`, default `claude-sonnet-5-5`. A gateway's own alias goes here unchanged |
| Vision models | A three-step ladder, see [extraction quality ladder](#extraction-quality-ladder). `AI_VISION_PRIMARY` defaults to `claude-haiku-5-5`, `AI_VISION_SECONDARY` to `claude-sonnet-5-5`, `AI_VISION_TERTIARY` to `claude-opus-5` |
| HTTP client | `httpx`, async, for calls back to the API |
| PDF text | `pypdf`, for the deterministic first pass over a PDF that carries its own characters (D42) |
| Validation | Pydantic models on every request and response |
| Lint and format | `ruff` |
| Tests | `pytest`, with the model always mocked, plus an opt-in live set |

### Reaching the model

`AI_BASE_URL` decides where the SDK sends its requests: empty is Anthropic's own endpoint, and a gateway speaking the Anthropic protocol goes there instead (D67). Model ids are whatever that endpoint calls them, so a gateway alias such as `free-main` goes straight into `AI_CHAT_MODEL`.

Two consequences, both load-bearing:

- **Everything goes through the streaming API.** A gateway may answer every request as an event stream whatever the request asked for, which is what 9Router does, and the SDK cannot parse that as a JSON body. `app/core/model.py` exposes `complete()`, which streams and returns the assembled message, and nothing calls `messages.create`.
- **A gateway's own prompt counts.** The model behind an alias is not fixed and the gateway may prepend its own system prompt, which shows up as input tokens this service did not send. It changes cost accounting and it is a reason the [quality ladder](#extraction-quality-ladder) scores every extraction rather than trusting the model.

## Endpoints

Every route requires `x-api-key`, and every body is OWE1 (D22). There is no user-facing authentication here (D4).

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness. No key, no session: the container healthcheck runs without credentials |
| GET | `/.well-known/oewang-keys` | The service's Ed25519 public keys, pinned by the API. Plaintext by design |
| POST | `/v1/handshake` | Opens a crypto session. Plaintext, signed rather than encrypted |
| GET | `/v1/session` | The caller's own crypto session. Reaching it proves the session is live |
| POST | `/chat/stream` | Tool-loop chat, answers `text/event-stream` |
| POST | `/receipt/parse` | Image bytes to a structured receipt draft |
| POST | `/receipt/categorize` | A saved receipt's merchant and item names to one of the given expense category names, or null (D86) |
| POST | `/import/map-columns` | Column names plus two sample rows to a column mapping (D28) |
| POST | `/import/extract` | Statement image or PDF to structured transaction rows |
| GET | `/tools/definitions` | The tool schemas, so the API can validate against the same contract |

There is no session-title endpoint. The API sets a session's title from the first user message, with no round trip to this service (CHAT-8): a chat title is not a place where a model's judgement earns a call on the first turn of every new conversation.

### Request handling

Three layers, outermost first. A caller failing one never reaches the next.

| Layer | What it does |
|---|---|
| Service key | `x-api-key` compared in constant time (SEC-1). `/health` and the published keys are the only routes without it |
| Rate limit | A sliding window per caller, `RATE_LIMIT_PER_MINUTE`, with a lower ceiling on the handshake. A loop in the API cannot become an unbounded spend on the model |
| OWE1 | Opens the request body and the sealed query string, seals the response, binding the HTTP status. The same contract as the Rust middleware, pinned by the shared vectors |

A failure the caller may not be able to decrypt, which means a crypto failure, a missing key or a rate limit, answers in plaintext and is marked with `x-owe-transport-error`. Everything else is sealed.

Sessions live in process memory for at most 24 hours or 2^24 messages, exactly as on the API. A restart drops them, and the API's client answers `CRYPTO_SESSION_UNKNOWN` by running one new handshake and retrying once.

### `POST /chat/stream` request

```json
{
  "workspace_id": "clx…",
  "user_id": "clx…",
  "role": "admin",
  "session_id": "clx…",
  "turn_id": "clx…",
  "message": "How much did I spend on food last month?",
  "history": [ { "role": "user", "content": "…" }, { "role": "assistant", "content": "…" } ],
  "context": {
    "currency_code": "IDR",
    "today": "2026-11-02",
    "wallets": [ { "id": "clx…", "name": "Cash", "balance": "250000.0000", "is_default": true } ],
    "categories": [ { "id": "clx…", "name": "Food", "type": "expense" } ]
  },
  "settings": { "custom_instructions": null, "response_language": "auto" },
  "attachments": [ { "vault_file_id": "clx…", "type": "image/jpeg", "url": "/v1/vault/files/clx…/chunks/0" } ]
}
```

The workspace context is supplied by the API (CHAT-7). The service does not fetch it unless a tool asks for a refresh mid-turn.

`turn_id` is minted by the API, one per user turn, and the service echoes it unchanged on every tool call it makes in that turn ([tool execution](../api/endpoints.md#post-v1internaltoolsexecute-body)). The service never mints one and never reuses one from an earlier turn: the per-turn caps are counted against it, so an id the service produced itself would be a budget the service hands itself.

`attachments[].url` is a path on the API, not a signed storage URL: there are none (D23, VLT-3). It is read back through the API like any other file.

`context.timezone` is optional and currently absent: the data model carries no workspace timezone, so `today` is UTC and the prompt drops the timezone line rather than stating one it cannot know.

## Tool catalog

Fifteen tools (D17, D88, D103): eleven cut down from thirty-four in the old app, three analysis tools brought back for the canvas, and the budget status that came back with budgets. The schemas the model sees live in one Python module and are exposed at `GET /tools/definitions`, so the API's own validator can be checked against them.

### Read tools

| Tool | Arguments | Returns |
|---|---|---|
| `get_workspace_context` | none | Wallets and categories. Rarely needed; the prompt already carries them. Use after creating a wallet mid-turn |
| `get_recent_transactions` | `limit` (1 to 50), `from`, `to` | Recent transactions, newest first |
| `search_transactions` | `query`, `type`, `category_id`, `wallet_id`, `min_amount`, `max_amount`, `from`, `to`, `limit` | Matching transactions. It shares the list route's filter, so the two amount bounds compare on the base amount, the workspace's own currency (D77), which is the currency the assistant speaks in anyway |
| `get_spending_summary` | `from`, `to`, `group_by` (`category`, `wallet`, `type`, `month`) | Totals per group, with a grand total |
| `get_spending_analysis` | `from`, `to` | Spending total with the previous-period comparison, the category breakdown and the ten largest expenses. Leaves a `spending` canvas artifact (D88) |
| `get_income_summary` | `from`, `to` | Income total with the comparison, monthly series and average, the category breakdown and the latest ten rows. Leaves an `income` artifact; the year-before series goes to the artifact only |
| `get_burn_rate` | `from`, `to` | Monthly spending, the average per month, and how many months ran above it. Leaves a `burn-rate` artifact |
| `get_budget_status` | `month` (`YYYY-MM`, optional, defaults to the current month) | Every budget for that month with its limit, spent, remaining, percentage and state, the totals, and a summary sentence; fullest first. Leaves a `budget` artifact when any budget exists (D103) |

### Write tools

| Tool | Arguments | Role |
|---|---|---|
| `create_transaction` | `type`, `amount`, `to_amount`, `wallet_id`, `to_wallet_id`, `category_id`, `date`, `name`, `description` | admin+ |
| `update_transaction` | `transaction_id` plus any creatable field, `to_amount` included | admin+ |
| `delete_transaction` | `transaction_id`, `confirmed` | admin+, plus confirmation (CHAT-6) |
| `add_transaction_items` | `transaction_id`, `items[]` | admin+ |
| `create_wallet` | `name`, `group_id`, `currency_code` | admin+ |
| `create_category` | `name`, `type` | admin+ |

### Interaction tool

| Tool | Arguments | Purpose |
|---|---|---|
| `present_choices` | `question`, `choices[]` | Ask the user to disambiguate a wallet, a category or a date instead of guessing |

Required arguments, types and enums are in the schema module. Money arguments are strings, matching the wire format (D12).

Three things the table cannot carry on its own:

- `create_wallet` has no opening balance. `wallets.balance` defaults to 0 and the only thing that moves it is a transaction, so a tool that offered one would be offering something the ledger cannot do.
- `create_wallet.currency_code` is optional. Absent means the workspace currency (WAL-5), which is what almost every wallet wants.
- `to_amount` is on both write tools because a transfer is refused without it: `amount` leaves the source wallet in its currency and `to_amount` arrives in the destination's (TXN-18), and a transfer missing it answers `TRANSFER_AMOUNT_REQUIRED`. A tool that cannot supply `to_amount` cannot make a transfer at all.

**The enforcing copy of these schemas is `apps/api/crates/domain/src/tools.rs`,** not this table and not the Python module. The model is shown the Python definitions; the Rust validator decides whether a call runs, and it rejects an argument key the tool does not declare rather than ignoring it. A model that invented a parameter misunderstood the call it was making, and dropping that parameter silently turns a misunderstanding into a write the user did not ask for. `GET /tools/definitions` exists so the two copies can be compared rather than assumed equal.

### What was dropped

From the old app's thirty-four tools: everything for debts (4), contacts (4), budget writes (3; the read came back with D103), wallet groups (3), documents (4), bill splitting (1), export (1), recall (1), receipt re-send (1), plus eleven analysis tools that produced canvas artifacts. All belong to features out of scope ([PRD non-goals](../prd.md#non-goals-for-v1)).

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
- Timezone: Asia/Makassar        (omitted while the workspace has none)
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
  "category": { "id": "clx…", "name": "Food" }
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
| `artifact` | `{"id": "t1", "type": "spending", "payload": {…}}` | A canvas artifact for that call (D88). **Sent by the API's stream pump, never by this service**: the API built it during the tool call, holds it in the turn store under the call id this service sends as `call_id`, and injects it after the result. An `artifact` event from this service is dropped |
| `receipt_draft` | `{"draft": {…}}` | A parsed receipt, pending confirmation |
| `done` | `{"message_id": "clx…", "usage": {"input": 1204, "output": 311, "model": "claude-sonnet-5-5"}}` | Turn complete. `usage` is summed over every model round in the turn; `model` is `AI_CHAT_MODEL`. The API records it in `ai_usage` (D92) |
| `error` | `{"code": "TOOL_FAILED", "message": "…"}` | Failure after the stream opened |

Rules:

- `done` or `error` always arrives last. A stream never ends silently.
- An error before the stream opens uses the normal JSON envelope instead ([conventions](../api/conventions.md#streaming)).
- Buffering is disabled at every hop, including uvicorn and any reverse proxy.

## The tool loop

```
build the system prompt
messages = history + user message
for round in 1..=AI_MAX_STEPS:         # default 8 (CHAT-5)
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
- **Blast-radius caps.** The API refuses more than 3 write calls, more than 1 delete, or more than 3 created transactions in one turn (D25, D68, SEC-23), counted against the `turn_id` the service echoes on every call. The refusal is `TOOL_CAP_EXCEEDED` and the service relays it.
- **Tool errors are data.** A refusal or a failure is appended as a tool result, so the model can explain it. It is never raised as an exception that kills the turn.
- **No retry on refusal.** `TOOL_FORBIDDEN`, `TOOL_CAP_EXCEEDED` and `CONFIRMATION_REQUIRED` are relayed to the user, not worked around.
- **No client-side authorization.** The service never decides that a call is allowed. It asks the API and reports the answer.
- **Bounded history.** A long conversation is truncated to a bounded window before it is sent, so cost per turn does not grow without limit.

## CSV column mapping

The cheapest and most reliable part of import (D28, AI-9). The model is shown the **column names** and two sample rows, each cell clamped to 80 characters. It returns a mapping and nothing else.

```json
{
  "request_id": "01JC0…",
  "workspace_id": "clx…",
  "columns": ["Tanggal", "Keterangan", "Debet", "Kredit", "Saldo"],
  "sample_rows": [
    {"Tanggal": "02/11/2026", "Keterangan": "WARUNG TEKKO", "Debet": "50.000", "Saldo": "1.200.000"}
  ]
}
```

Returns:

```json
{
  "mapping": { "date": "Tanggal", "name": "Keterangan", "amount_out": "Debet", "amount_in": "Kredit", "balance": "Saldo" },
  "model": "claude-sonnet-5-5",
  "usage": { "input": 412, "output": 58, "model": "claude-sonnet-5-5" }
}
```

The mapping may name any of exactly eight fields, all optional: `date`, `name`, `counterparty`, `amount_out`, `amount_in`, `amount`, `balance`, `currency`. The list matches `ColumnMapping` on the Rust side; a key outside it is dropped rather than relayed.

**The two amount shapes are alternatives, never both** (rule 7). A statement either prints separate debit and credit columns, which map to `amount_out` and `amount_in`, or one signed column where money out carries a minus sign, which maps to `amount`. `csv_import::read_amount` reads whichever shape it is handed: negative is an expense and positive is income for the single column, and the column itself carries the direction for the pair. A mapping carrying both describes two readings of one file, so the service drops `amount` when either half of the pair survives: the pair states the direction in the layout rather than in a sign the importer has to find.

`balance` stays in the catalog even though Rust ignores it, and that is deliberate rather than an oversight. A running balance is the state of the account, not a transaction field, so there is nothing for the importer to do with it. Taking it out of the catalog would leave the model with nowhere to put the column, and what it does then is map it to an amount.

The model is `AI_CHAT_MODEL`, not one of the vision ids: nothing here is an image, and it is a short reasoning task over a handful of strings that runs once per file. The answer is capped at 512 output tokens, because a mapping is one small JSON object and a ceiling on it is a ceiling on how long an import waits before it starts. The call passes `tools=[]` like every other call on the capture path: the column names and sample cells came out of a file somebody uploaded.

Rules in the prompt, with few-shot examples for each:

1. Return only exact column names from the input. Never invent one.
2. Omit a field when no column matches.
3. `name` is the transaction text, memo or merchant.
4. `counterparty` is the other party: merchant, vendor, payee, recipient. **Never** a column that names the account holder (`Nama Pemilik`, `Cardholder`, `Account Holder`). That is the user, not the counterparty.
5. Never map two fields to the same column.
6. For currency, return a column name if one exists, otherwise an inferred ISO 4217 code.
7. Return one amount shape, never both: `amount_out` plus `amount_in`, or `amount` on its own. `balance` is not an amount.

The answer is then cleaned before it is relayed, and four things are dropped: a field this importer does not have, a value that is not one of the columns the model was shown (rule 1), a column an earlier field already used (rule 5), and `amount` when the split pair is also present (rule 7). `currency` is the one exception to the second, because rule 6 lets it be an inferred ISO code. Dropping beats relaying: a mapping naming a column that does not exist fails in the Rust importer as a lookup against every row of the file. An answer that cleans down to nothing comes back as an empty mapping rather than an error, so the API can ask the user which column is which; an answer that is not JSON at all is `COLUMN_MAPPING_FAILED`, a 422.

Cleaning cannot catch rule 4. `Nama Pemilik` is a real column with real values in it, and nothing downstream can tell that mapping it to `counterparty` is wrong. The prompt is the defence, which is why the test suite asserts the prompt still names those headers.

**Every row is then transformed by deterministic Rust code.** The model never sees an amount, never produces an amount, and cannot move a decimal point. Cost is one small call per file whether the file has 10 rows or 10,000.

Indonesian bank statements split debit and credit into two columns, which the old app's row-extraction approach handled by asking the model to infer direction per row. Column mapping handles it once, as a mapping, and the sign rule lives in code.

## Receipt and statement parsing

| Endpoint | Models | Tools | Output |
|---|---|---|---|
| `POST /receipt/parse` | [ladder](#extraction-quality-ladder) | none | merchant, date, total, subtotal, tax, currency, line items, quality score |
| `POST /import/extract` | [ladder](#extraction-quality-ladder) | none | rows of date, description, amount, direction, quality score |
| `POST /receipt/categorize` | `AI_CHAT_MODEL`, one call | none | `{ category, model, usage }`: one of the given names exactly, or null |

The first two take the same body, because both run the same ladder over the same kind of document (`/receipt/categorize` takes `{ request_id, workspace_id, merchant, items, categories }`, strings only):

```json
{
  "request_id": "01JC0…",
  "workspace_id": "clx…",
  "document": { "media_type": "image/jpeg", "data": "<base64>" },
  "workspace_currency": "IDR",
  "today": "2026-11-03"
}
```

`media_type` is one of `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Anything else answers `UNSUPPORTED_MEDIA_TYPE` with a 400, in the normal envelope. `today` and `workspace_currency` come from the API because this service reads no database (D3): `today` is what a date is judged believable against, and the currency is a hint for an ambiguous symbol, never a value to fill in.

A PDF carrying a real text layer skips the model entirely on the first attempt: the text is extracted and parsed deterministically, and vision runs only when that yields nothing usable (D42). Reading a PDF's own text is cheaper and more accurate than looking at a picture of it, and it is the same principle as the ladder: escalate on evidence. The deterministic parser reads only what it can read without guessing, which in particular means it leaves an ambiguous numeric date (`03/04/2026`) absent rather than assuming a day-first convention.

**Both calls pass no tools at all** (D24, SEC-21). The input is attacker-controlled text, so the component that reads it is given nothing to call. An instruction printed on a receipt reaches a model that has no `create_transaction` and no `delete_transaction` to reach for. This is the strongest control in the feature; see [AI safety](../security/ai-safety.md). In the implementation there is exactly one function that calls the model for extraction, so `tools=[]` is one line, and the tests assert it on every call of every ladder path rather than once.

Both validate the result before returning it, and `RECEIPT_UNREADABLE` or `STATEMENT_UNREADABLE` (AI-3) is the answer only when nothing usable came out of any pass: a 422 in the service envelope. There is no separate "retry once with a stricter instruction" step. That is what the ladder's pass 2 and pass 3 are, and running a stricter retry as well would be a fourth model call with no exit condition of its own. Neither endpoint writes anything anywhere.

**Every money figure is a string on the wire** (D12), and `Decimal` everywhere inside. The JSON parser is given `parse_float=Decimal`, so a model that writes `87500.00` without quotes still never produces a float. An amount this service cannot read unambiguously is reported as absent-and-flagged rather than guessed at: `87.500` is 87,500 in Jakarta and 87.5 in Chicago, and nothing in this process can tell which.

`/import/extract` is used only for an image or a PDF. Anything with columns goes through [column mapping](#csv-column-mapping) instead, because deterministic beats model-driven whenever structure exists.

### Responses

```json
{
  "draft": {
    "merchant": "Warung Tekko",
    "date": "2026-11-02",
    "total": "87500.0000",
    "subtotal": "80000.0000",
    "tax": "7500.0000",
    "currency": "IDR",
    "line_items": [ { "name": "Iga bakar", "amount": "45000.0000", "quantity": "1", "unit_price": "45000.0000" } ]
  },
  "quality": { "score": 62, "low_confidence_fields": ["date"], "corrected_fields": [] },
  "passes": 1,
  "models": ["claude-haiku-5-5"],
  "usage": { "input": 1873, "output": 402, "model": "claude-haiku-5-5" }
}
```

```json
{
  "rows": [ { "date": "2026-11-02", "description": "WARUNG TEKKO", "amount": "87500.0000", "direction": "expense" } ],
  "quality": { "score": 88, "low_confidence_fields": [] },
  "passes": 1,
  "models": ["claude-haiku-5-5"],
  "usage": { "input": 2410, "output": 655, "model": "claude-haiku-5-5" }
}
```

Rules on these shapes:

- A field the service is not sure of is **left out**, and named in `low_confidence_fields`. A date that did not validate is absent here, never emitted as something plausible: the confirmation sheet can ask about an absence and cannot flag a fabrication the user taps past.
- `corrected_fields` is always present and always `[]` from this service. [Cross-field consistency](#cross-field-consistency) is the API's pure Rust pass (D30, AI-7) and it is the only thing that fills it. Two layers correcting the same number is how a user ends up unable to tell which figure came off the receipt.
- `passes` counts the **model** passes reached: `0` when the PDF's text layer answered and no model was called at all, up to `3`. Pass 4 is Rust's, so it is never counted here.
- `models` carries one entry per pass, in order, or the sentinel `pdf-text-layer` for a pass 0 answer. It is not a model id and is deliberately not shaped like one, so a cost report cannot count it as a model call.
- `usage` is on every extraction response: `/receipt/parse`, `/import/extract`, `/import/map-columns` and `/receipt/categorize` (D92). For a ladder it is the tokens of every model request summed across passes, with `model` the last model asked; the ladder's `_Budget` accumulates them. A document answered by a PDF's text layer alone reports zero tokens and a null `model`. `core/model.py` holds the two helpers: `tokens_of(message)` reads a finished message's counts, as zero when a gateway omits them, and `usage_report(input, output, model)` builds the field. This service keeps none of it; the API writes it to `ai_usage` ([usage](../features/usage.md)). An error response carries no `usage`, so the tokens a refused extraction spent are not recorded.
- A statement row missing a date or an amount is dropped from `rows`. The API would discard it anyway, and the score has already counted it against the page.
- `low_confidence_fields` is always empty for a statement. There is no field to point at on a forty-row page, and naming every column says less than the score already does.

## Extraction quality ladder

Most receipts are easy. A clear photograph of a supermarket receipt does not need the most capable model, and paying for one on every upload is waste. A crumpled thermal receipt photographed at an angle does need it.

So extraction starts cheap and escalates only on evidence (D36, AI-10). Adapted from Midday's four-pass engine ([research](../research/midday.md#34-the-document-path-a-quality-ladder-not-one-big-call)), with Claude as the single provider (D11) and a wall-clock budget added, because oewang's receipt flow is synchronous and a user is watching.

### The passes

| Pass | Model | What it does | Exit condition |
|---|---|---|---|
| 0 | none | A PDF's own text layer, parsed deterministically (D42) | Score at or above the threshold: return |
| 1 | `AI_VISION_PRIMARY` | Extract with the standard prompt. Score the result | Score at or above the threshold: return |
| 2 | `AI_VISION_SECONDARY` | Re-extract with a chain-of-thought prompt. Merge the two results field by field, weighted by confidence. Re-score | Score now at or above the threshold: return |
| 3 | `AI_VISION_SECONDARY` | Re-extract **only** the fields still missing or invalid, one targeted prompt per field. Merge back | Always continues to pass 4 |
| 4 | none | [Cross-field consistency](#cross-field-consistency) in Rust: arithmetic fixes, date and currency sanity (D30) | Final result |

`AI_VISION_TERTIARY` is used in pass 2 instead of the secondary when pass 1 scored below half the threshold, meaning the primary model did not produce something worth merging with. A pass 1 that failed outright scores zero, so it escalates the same way. There is no separate fourth model call.

Pass 0 runs only for `application/pdf`, and only its own exit matters: a text layer that scores **below** the threshold is discarded rather than merged into pass 1. It is a parser's guess at a layout, and merging a weak guess would let a misparsed label outvote a field the model read correctly.

Pass 3 runs only for a receipt. A statement's quality is a share of valid rows rather than a set of named fields, and "re-read row 7" is not a prompt that can be written against a page the model numbers differently each time, so a statement's ladder stops after pass 2. A targeted answer is kept only when swapping it in actually raises the score; one that answered with something no better leaves the field alone.

Most uploads stop at pass 1.

### Quality score

A single number from 0 to 100. Start at 100 and deduct per field, weighted by how much the field matters. Threshold is 70, configurable as `AI_QUALITY_THRESHOLD`.

Receipts:

| Field | Missing | Present but invalid |
|---|---|---|
| `total` | -30 | -15 |
| `currency` | -25 | -10 |
| `merchant` | -20 | n/a |
| `date` | -15 | -5 (bad format or outside a reasonable range) |
| `line_items` | -10 | -5 (items do not sum close to the total) |

The field is `total` here and on the wire. An earlier draft of this table called it `total_amount`; there was never a second field, and the two names are the same thing.

Statement rows score on the batch: a row missing a date or an amount is invalid, and the score is the share of valid rows. A page with no rows at all scores zero.

The weights are deliberate, and they add up to 100 exactly, so a receipt with every scored field missing scores zero. A receipt with no merchant name is still useful, because the user can type it. A receipt with no total is not a receipt.

What counts as invalid, field by field:

| Field | Invalid when |
|---|---|
| `total` | Present and not a positive decimal, or present as text this service will not read as a number |
| `currency` | Present and not three letters |
| `merchant` | Never. Any string the document carried is a usable name, which is why the table above has no invalid weight for it |
| `date` | Not `YYYY-MM-DD`, or outside one day after `today` and ten years before it |
| `line_items` | They do not sum close to the printed subtotal, or to the total when no subtotal was read. Tolerance is one percent, with a floor of one unit |

`subtotal` and `tax` are merged and returned but not scored. They are useful when present and cost nothing when absent, and the API's consistency pass is what has an opinion about them.

**Present but unreadable is not the same as missing**, which is why the internal result type can say both. A model answering `"total": "about 87 thousand"` saw a total; it is the reading that failed, and a reading is something the targeted pass can re-ask for. Collapsing the two at parse time would throw that away before anything could score it.

### Merging two results

Pass 2 produces a second result, not a replacement. Merge rules, in order:

1. A field present in one result and absent in the other: take the present one.
2. Both present and the confidences differ by more than 0.1: take the higher-confidence result's value.
3. Both present and the confidences are close: field-specific rules decide. For `total`, prefer the value that agrees with the rest of its own reading. For `date`, prefer the one inside a reasonable range. For `merchant`, prefer the longer string, because truncation is the common failure. For `subtotal`, `tax` and `currency` there is nothing to appeal to, so the earlier pass wins and the ladder does not churn on equal evidence.
4. `line_items`: take the longer list. Consistency fixes on that list are Rust's (D30), not the merge's.

Rule 3's total deserves a sentence, because "agrees with the sum of the line items" taken literally never fires on a receipt with tax on it: the items sum to the subtotal and the total is the subtotal plus the tax. So the comparison is against the whole of the rest of that reading, which is the printed subtotal when there is one and the items when there is not, plus the tax when there is one.

Confidence is derived from the result's own quality score and its missing critical fields, so it is computed, not asked for from the model. A model that misread a total states its confidence in the misread total just as firmly. A missing `total` or `date` costs 0.15 of confidence beyond what the score already took: a result with no total is not "70% as trustworthy", it is a different kind of answer.

Nothing in the merge corrects a figure. Choosing the total that agrees with its own line items is choosing between two things the models said; replacing a total with the sum of the items is arithmetic, and arithmetic belongs to the API's consistency pass (D30, AI-7).

Statement results do not merge field by field, because rows are not fields: two passes over a page produce two orderings of overlapping rows, and matching them up is guessing which `WARUNG TEKKO 87500` is which. The page with more valid rows wins whole, and the earlier pass wins a tie.

### Budget and caps

The ladder cannot run forever. A user is waiting on a confirmation sheet.

| Limit | Value | Behaviour on breach |
|---|---|---|
| Model calls per document | 2 full passes plus at most 4 targeted field calls | Stop and return what exists |
| Wall clock per document | 45 seconds, `AI_EXTRACTION_BUDGET_MS` | Stop at the current pass and return |
| Per-call timeout | 20 seconds | Count as a failed pass, continue the ladder |

When the budget runs out mid-ladder, the result is returned with its score, marked low confidence. It is not an error: a partially extracted receipt the user can correct beats a spinner that ends in a failure message.

"Marked" is not a separate flag. A result that a cap stopped is below the threshold by construction, because the ladder only kept going while it was, so its own `quality.score` and `low_confidence_fields` already say so. A field the response does not carry is a field the sheet asks about.

A call is never given more time than the budget has left: the per-call timeout is the smaller of 20 seconds and the remaining wall clock. Otherwise a 20 second call starts with 3 seconds of budget left and spends 17 of them on an answer that will be thrown away.

`RECEIPT_UNREADABLE` (AI-3) is returned only when the result after pass 4 still has no `total` and no usable `date`. Below the threshold but with those two present, the draft is returned and marked (AI-11), and the confirmation sheet highlights the weak fields for the user to check. The statement equivalent, `STATEMENT_UNREADABLE`, is returned when no row carries both a date and an amount. Both are 422.

**Unreadable is not the same as unanswered.** If no full reading came back (pass 1 and pass 2 both timed out, failed, or answered outside the agreed shape, and no PDF text layer was read), nothing read the document, and the ladder raises `EXTRACTION_NO_ANSWER` (503) instead. Fields the targeted pass found on its own do not count: after two timed-out passes it can return a total alone, and the Telegram path would have saved that as a transaction dated today with no merchant and no items. The API passes it on as its own code, and the web app and the Telegram bot tell the user to try again rather than to take a sharper photo. Found with a clear receipt that came back "unreadable" because a slow model timed out on every pass; the same file read at score 100 on a retry.

The service's own `oewang.*` loggers write at INFO to the container log, so a failed extraction shows which pass timed out, failed or answered out of shape. Those lines name models, codes and counts, never the document (OPS-3).

A failed pass never aborts the ladder. Pass 2 failing falls through to pass 3; pass 3 failing falls through to pass 4. A pass fails on a timeout, a transport error, a provider error, or an answer that is not JSON; all four are a pass that produced nothing, and none of them is a request that failed.

### What the user sees

The draft carries its score and a per-field flag:

```json
{
  "draft": { "merchant": "Warung Tekko", "total": "87500.0000", "date": "2026-11-02", "line_items": [ … ] },
  "quality": { "score": 62, "low_confidence_fields": ["date"], "corrected_fields": ["total"] }
}
```

The confirmation sheet marks a `low_confidence_field` for attention and a `corrected_field` as replaced by arithmetic ([chat](../features/chat.md#canvas)). The user always sees which numbers the model gave and which the code fixed.

That example is the draft **after the API's pass 4**. Out of the AI service `corrected_fields` is always `[]`, because the service does not correct anything.

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
- Logged per extraction, as one line: `request_id`, `workspace_id`, the pass reached, the model used at each pass, the quality score after each pass, the fields re-extracted, the number of model calls, and total duration. This is the data that says whether the ladder's threshold is set correctly, and whether the primary model is good enough to stay primary.
- Never logged: prompt text, message content, receipt images, extracted receipt text, **any extracted field value**, the Anthropic key (OPS-3). The re-extracted fields are logged as names, never with what they turned out to be. A failed pass logs the exception type and not its message, because a provider's message can quote the request back.
- The same rule reaches the refusal bodies. This service answers a refused request body with its own envelope rather than FastAPI's, because FastAPI's default echoes the offending `input`, and on `POST /receipt/parse` the offending input is a base64 receipt.

Token usage is logged for cost visibility. There is no quota enforcement; billing is out of scope.

## Testing

| Kind | Approach |
|---|---|
| Tool loop | A fake model client returns a scripted sequence: one call, a chain, a refusal, a cap breach |
| Prompt | Golden-file test on the assembled prompt for a fixed context |
| Schemas | `GET /tools/definitions` matches the schema module, so the API and the model cannot drift |
| Parsing | Three receipt fixtures with known totals and dates, run against a recorded response, plus one whose stated total is deliberately wrong and which the service must surface unchanged |
| Quality score | Pure function, no model. A complete receipt scores 100, each missing field deducts its stated weight |
| The empty tool list | Asserted on **every** call of **every** ladder path, not once. The control is that no branch passes a tool, and a single test of one branch does not say that |
| The PDF text layer | A committed one-page PDF with a real text layer scores 100 and makes no model call at all; one without a text layer escalates |
| The clock | Scripted, not slept through. The wall-clock budget is a rule about `time.monotonic`, so a scripted answer says "this call took 46 seconds" and the ladder behaves exactly as it would have |
| Column mapping | The clamp (two rows, 80 characters a cell) asserted on what reached the model, and rule 4 asserted twice: once on the cleaner and once on the prompt still naming the account-holder headers |
| The provider | `tests/test_model_live.py`, opt-in with `RUN_LIVE_MODEL_TESTS=1`. Proves the two things the rest of M4 stands on, a streamed answer and a tool call in the Anthropic shape, actually survive whatever `AI_BASE_URL` points at. Asserts shape, never wording |
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
