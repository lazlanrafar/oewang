# Feature: Plans

Status: draft v0.1, 2026-11-28. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md) PLN-1 to PLN-8. Decision D128. Epic OEW-130, stories OEW-131 to OEW-134.

A plan limits a workspace: AI tokens per calendar month, stored bytes, and which features it may use. Operators define plans and assign them in the [console](console.md). There is no payment and no self-serve upgrade.

## Update this doc when

- Adding a feature to the `Feature` list, or an entry point that checks one.
- Changing how a limit is counted, when it is checked, or what a refusal answers.
- Changing the console's plan screens or the plan a new workspace gets.

## Rules

- Every workspace holds exactly one plan (`workspaces.plan_id`).
- The system plan, Free, is held by every workspace given no other, new ones included, and cannot be deleted. It ships unlimited with every feature, so the deploy that starts enforcing blocks nobody (D128).
- A plan a workspace holds is not deleted (`PLAN_IN_USE`). Plans are soft deleted.
- A null limit is unlimited.
- Tokens count input plus output over the calendar month in UTC, the same month as the [usage](usage.md) page.

## Features

A fixed list in code, like console permissions, because each one is a check at an entry point (D128, D125). Operators choose which of them a plan includes; they cannot add one.

| Key | Entry points that refuse it | Stays readable and usable without it |
|---|---|---|
| `chat` | `POST /v1/ai/chat/stream` (`ai::handler::chat_stream`), before the rate limit and before the message is written | Past conversations: `GET /v1/ai/sessions`, `GET /v1/ai/sessions/{id}`; rename and delete. `POST /v1/ai/sessions` makes an empty conversation and spends nothing, so it is not checked |
| `telegram` | `POST /v1/integrations/telegram/link-token` (`telegram::link::issue`); every incoming message (`telegram::message::handle`) and button tap (`telegram::callback::handle`) from a linked chat, after the link and membership checks | The link is never deleted. `/disconnect` still works, as do `GET /v1/integrations/telegram` and `POST /v1/integrations/telegram/unlink`. A message gets one plain line naming the plan, never silence |
| `receipt_scan` | `POST /v1/ai/receipt/parse` and every other read of a receipt, through `ai::service::parse_receipt`: the bot's photo and the queue's retries; `POST /v1/receipts/pending` (`receipts::handler::queue_receipt`); the bot's photo is also refused before it is downloaded (`telegram::receipt::handle`) | Saved expenses and their files. `GET /v1/receipts/notices` and marking them seen. A job already queued is not read: it waits with the queue's backoff, as a suspended workspace's does, and reads if the feature comes back |
| `statement_import` | `POST /v1/transactions/import` (`transactions::statement::start`), before the file is read or a job is written | `GET /v1/transactions/import/{job_id}`, and every imported transaction. CSV and spreadsheet import (`/import/csv`, `/import/xlsx`, `/import/map-columns`) are not statement import and are not checked |
| `mcp` | Every `tools/call` on `POST /v1/mcp` (`mcp::service::call`), in the workspace the call resolves to, so a token that reaches several workspaces is refused only where the plan leaves MCP out | `initialize`, `tools/list` and `list_workspaces`, which read the token rather than a workspace. Tokens and connected apps are listed, created and revoked in the account area as before |
| `vault` | `POST /v1/vault/files` (`vault::handler::begin`), before a file row is reserved | Listing, details, chunks, thumbnails, rename, retag and delete of stored files, and every attachment. An upload begun before the change may finish |

There is no MCP tool, chat tool or Telegram command that uploads a file, scans a receipt or imports a statement, so the table is every entry point. The AI service checks nothing: it has no database (D3), and the chat tools it calls back with run inside a turn the stream already let through.

Two combinations are worth knowing. The web uploads a receipt or a statement into the vault before it asks for the read, so on the web both need `vault` as well; the bot stores the photo itself and needs `telegram` and `receipt_scan` only. A Telegram question is a Telegram message, not a web chat turn, so it needs `telegram` and not `chat`.

### How the check works

One function, `plans::require(executor, workspace_id, feature)` in `apps/api/crates/server/src/plans.rs`, reads the plan through `repositories::plans::workspace_plan` on every call. Nothing is cached in the token or in process memory, so an operator's change applies on the next request without a new sign-in. An unknown or deleted workspace passes the check, so the caller's own answer (`NOT_A_MEMBER`, `NOT_FOUND`) stands as it did before plans existed.

`FEATURE_NOT_IN_PLAN` is a 403 with the feature key in `details.feature`, so the app can name it (PLN-7). 403, because the caller is signed in and the request is well formed, but this workspace may not do this until an operator changes its plan: the same reading as `WORKSPACE_SUSPENDED`. Not 402, which promises a payment path the product does not have (PLN-8); not 409, which says the request conflicts with a row's state and might succeed once that row changes; not 404, because the route exists and hiding it helps nobody.

## Refusals

| Code | When |
|---|---|
| `QUOTA_TOKENS_EXCEEDED` | A model call at or past the plan's monthly token limit (OEW-132) |
| `QUOTA_STORAGE_EXCEEDED` | An upload that would take stored bytes past the plan's limit (OEW-132) |
| `FEATURE_NOT_IN_PLAN` | A feature the plan does not include, at one of the entry points above (403, `details.feature`) |

## Related docs

- [Usage](usage.md): what is recorded, which a limit is measured against.
- [Console](console.md): where plans are managed.
- [Data model](../data-model.md): the `plans` and `plan_features` tables.
