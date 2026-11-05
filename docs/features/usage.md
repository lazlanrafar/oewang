# Feature: Usage

Status: v0.1, 2026-11-05. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md) USG-1 to USG-3. Decision D92.

What a workspace stores and what its model calls cost, recorded and shown. Nothing is limited: billing and quotas stay a [non-goal](../prd.md#non-goals-for-v1). This is the record a limit would one day be built on.

## Update this doc when

- Adding a call to the AI service, or a feature value to `ai_usage.feature`.
- Changing how storage or tokens are summed, or what "this month" means.
- Changing the settings page or `GET /v1/workspaces/current/usage`.

## Data

`ai_usage`, append-only, one row per model call, and `vault_files` for storage. Columns are in [data model](../data-model.md#usage). Storage has no table or counter of its own: it is `SUM(size)` and the count over ready, live files (USG-1).

## Where tokens are recorded

The API records, because it is the only process with a database (D3). The AI service reports and keeps nothing.

| Feature | Recorded from |
|---|---|
| `receipt` | Receipt parse, through the `Meter` in `server/src/ai/extraction.rs` |
| `import` | Statement extraction, same module |
| `columns` | CSV column mapping, same module |
| `categorize` | The Telegram receipt's category pick, same module |
| `chat` | A web chat turn, through the `TurnMeter` in the stream pump |
| `telegram` | A Telegram chat turn, same pump, told apart by the turn's channel |

`ai/extraction.rs` is the one module that calls the AI service for extraction, so a new extraction call goes through the `Meter` or does not reach the service at all. A `Meter` carries the pool, the workspace and the user. The chat pump writes its row before the "nothing to store" early return, so a turn that produced no message is still counted.

What the AI service sends:

- Every extraction route answers `usage: {input, output, model}`. For a ladder it is the sum over every pass, and `model` is the last model asked ([AI service](../ai/service.md#responses)).
- The chat `done` event's `usage` carries `model` as well as the two counts.
- A gateway that omits token counts reads as zero, not as a failure.

**Recording is best effort.** A failed insert is logged and the call it describes still succeeds. The row records a call that already happened; failing a user's receipt over the bookkeeping would punish the wrong party.

**Known gap.** A refused extraction (an error response from the AI service) carries no `usage`, so the tokens spent on it are not recorded. The ledger undercounts failed calls.

## Found while wiring it

The Rust client read the AI service's map-columns answer, `{mapping, model}`, as a bare `ColumnMapping`. Every field was absent, so AI column mapping always came back empty. It now reads `{mapping, usage}`, with a unit test.

## The settings page

`/settings/usage`, "Usage" in the General group after Assistant. Readable by any member: nothing on it is secret and nothing can be changed.

| Part | Shows |
|---|---|
| Storage | Bytes used and the file count |
| AI tokens this month | Input and output since the first of the current calendar month, UTC |
| AI tokens all time | Input and output |
| By feature | Feature, calls, this month, all time |

The headline figures are summed from the per-feature rows in the API, so the cards and the table cannot disagree. The vault page's header shows the same storage figure.

## Testing

| Layer | Coverage |
|---|---|
| Unit (Rust) | The headline summed from the feature rows; missing token fields read as zero; tokens clamped into the column; the column mapping answer read out of `{mapping, usage}` |
| pytest | `usage` on every extraction response, summed across ladder passes; `model` in the chat `done` event |
| Browser | Not yet verified ([US-050](../backlog.md#us-050-usage-tracking-and-the-settings-page)) |

## Related docs

- [Vault](vault.md), whose header shows storage
- [Data model](../data-model.md#usage) and [endpoints](../api/endpoints.md#workspaces-and-members)
- [AI service](../ai/service.md)
