# Feature: Usage

Status: v0.1, 2026-11-05. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md) USG-1 to USG-3. Decision D92.

What a workspace stores and what its model calls cost, recorded and shown. Since D128 the workspace's [plan](plans.md) limits both, measured against exactly these figures ([Limits](#limits)). Billing stays a [non-goal](../prd.md#non-goals-for-v1).

## Update this doc when

- Adding a call to the AI service, or a feature value to `ai_usage.feature`.
- Changing how storage or tokens are summed, or what "this month" means.
- Changing the settings page, the sidebar's usage block, or `GET /v1/workspaces/current/usage`.

## Data

`ai_usage`, append-only, one row per model call, and `vault_files` for storage. Columns are in [data model](../data-model.md#usage). Storage has no table or counter of its own: it is `SUM(size)` and the count over ready, live files (USG-1).

## Where tokens are recorded

The API records, because it is the only process with a database (D3). The AI service reports and keeps nothing.

| Feature | Recorded from |
|---|---|
| `receipt` | Receipt parse, through the `Meter` in `server/src/ai/extraction.rs` |
| `import` | Statement extraction, same module |
| `columns` | CSV column mapping, same module |
| `categorize` | The Telegram receipt's category pick and the per-item category proposals (TXN-27), same module |
| `chat` | A web chat turn, through the `TurnMeter` in the stream pump |
| `telegram` | A Telegram chat turn, same pump, told apart by the turn's channel |

`ai/extraction.rs` is the one module that calls the AI service for extraction, so a new extraction call goes through the `Meter` or does not reach the service at all. A `Meter` carries the pool, the workspace and the user. The chat pump writes its row before the "nothing to store" early return, so a turn that produced no message is still counted.

What the AI service sends:

- Every extraction route answers `usage: {input, output, model}`. For a ladder it is the sum over every pass, and `model` is the last model asked ([AI service](../ai/service.md#responses)).
- The chat `done` event's `usage` carries `model` as well as the two counts.
- A gateway that omits token counts reads as zero, not as a failure.

**Recording is best effort.** A failed insert is logged and the call it describes still succeeds. The row records a call that already happened; failing a user's receipt over the bookkeeping would punish the wrong party.

**Known gap.** A refused extraction (an error response from the AI service) carries no `usage`, so the tokens spent on it are not recorded. The ledger undercounts failed calls.

## Limits

The plan's limits read these same figures, so the settings page and a refusal cannot disagree (PLN-4, PLN-5). The rule, every check site and the refusals are in [plans](plans.md#limits). In short:

- **Tokens.** Before a model call, this month's input plus output (`usage::month_tokens`, the same calendar month in UTC as the page) is compared with `max_tokens_month`; at or past it the call is refused with `QUOTA_TOKENS_EXCEEDED`, the AI service is not asked and no `ai_usage` row is written. Every extraction call checks through `Meter::check` in `ai/extraction.rs`; a chat turn checks in `begin_turn`, before its `TurnMeter` exists and before the user's message is written. The check is before a call, never during one, so the call that crosses the limit is recorded in full.
- **Storage.** Starting an upload compares the stored bytes above plus the declared size with `max_storage_bytes`.

## Found while wiring it

The Rust client read the AI service's map-columns answer, `{mapping, model}`, as a bare `ColumnMapping`. Every field was absent, so AI column mapping always came back empty. It now reads `{mapping, usage}`, with a unit test.

## The settings page

`/settings/usage`, "Usage" in the General group after Assistant. Readable by any member: nothing on it is secret and nothing can be changed.

| Part | Shows |
|---|---|
| Plan | The workspace's plan by name |
| Storage | Bytes used and the file count, and the plan's storage limit or "no limit" |
| AI tokens this month | Input and output since the first of the current calendar month, UTC, and the plan's monthly token limit or "no limit" |
| AI tokens all time | Input and output |
| By feature | Feature, calls, this month, all time |

The headline figures are summed from the per-feature rows in the API, so the cards and the table cannot disagree. Figures and limits are exact here; only the sidebar rounds them. The vault page's header shows the same storage figure.

## The sidebar

The foot of the app's sidebar shows this month's AI tokens (input plus output) and the vault's stored bytes and file count, and opens `/settings/usage`. It is laid out like the old app's `NavUsage`: a muted caps label with a percentage, the figure over the plan's limit, and a thin bar, in `layouts-sidebar-usage.svelte`. Both are measured against the workspace's [plan](plans.md) (`plan.max_tokens_month`, `plan.max_storage_bytes` from the usage endpoint), the same limits the API enforces. Past a limit reads over 100% with the bar full; a zero limit reads full. An unlimited (null) limit shows the figure alone, with no bar and no percentage, since there is nothing to fill. Tokens are compact ("153.3K / 500K") because the sidebar is narrow. The dashboard layout reads the endpoint alongside the pickers' lists, so it refreshes whenever the layout does (a navigation that reloads it, or any form action), and publishes the plan's features to the pages from the same read ([plans](plans.md#in-the-app-oew-134)). A failed read leaves the block out and withholds no feature, rather than blocking the shell. It is hidden on the collapsed rail, and the console's sidebar has none.

## Testing

| Layer | Coverage |
|---|---|
| Unit (Rust) | The headline summed from the feature rows; missing token fields read as zero; tokens clamped into the column; the column mapping answer read out of `{mapping, usage}` |
| DB (Rust) | Limits: tokens below, at and past, last month and other workspaces not counted; storage at and one byte past; null limits and the Free plan block nothing; a refused call reaches no AI service and writes no row; a refused turn writes no message (`usage/db_tests.rs`, `ai/tests.rs`) |
| pytest | `usage` on every extraction response, summed across ladder passes; `model` in the chat `done` event |
| Browser | Not yet verified ([US-050](../backlog.md#us-050-usage-tracking-and-the-settings-page)) |

## Related docs

- [Vault](vault.md), whose header shows storage
- [Data model](../data-model.md#usage) and [endpoints](../api/endpoints.md#workspaces-and-members)
- [AI service](../ai/service.md)
