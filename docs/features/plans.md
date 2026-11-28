# Feature: Plans

Status: v0.2, 2026-11-28. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md) PLN-1 to PLN-8. Decision D128. Epic OEW-130, stories OEW-131 to OEW-134.

A plan limits a workspace: AI tokens per calendar month, stored bytes, and which features it may use. Operators define plans and assign them in the [console](console.md). There is no payment and no self-serve upgrade.

## Update this doc when

- Adding a feature to the `Feature` list, or an entry point that checks one.
- Changing how a limit is counted, when it is checked, or what a refusal answers.
- Changing the console's plan screens or the plan a new workspace gets.

## Rules

- Every workspace holds exactly one plan (`workspaces.plan_id`).
- The system plan, Free, is held by every workspace given no other, new ones included, and cannot be deleted. It ships unlimited with every feature, so the deploy that starts enforcing blocks nobody (D128).
- The system plan's limits and features are edited in the console like any plan's, because the rollout is Free unlimited first and limits set once real usage is seen, which must not need a migration (D128). Its name stays: it is the plan every new workspace holds, under the readable id `free`. Unlike the system console role, it is not fixed, because nothing depends on Free holding everything.
- A plan a workspace holds is not deleted (`PLAN_IN_USE`). Plans are soft deleted.
- A null limit is unlimited.
- Tokens count input plus output over the calendar month in UTC, the same month as the [usage](usage.md) page.

## Data (OEW-131)

`plans` and `plan_features` (migration `0025_plans.sql`), and `workspaces.plan_id`, not null, default `free`. Columns in the [data model](../data-model.md#plans-plan_features). The default is what gives a new workspace the system plan, whichever path creates it.

The checks read a workspace's plan with `repositories::plans::workspace_plan(executor, workspace_id)`: `Option<WorkspacePlan { plan_id, name, max_tokens_month, max_storage_bytes, features: Vec<Feature> }>`, none for an unknown or deleted workspace. It takes the pool or a transaction.

## Console (OEW-131)

Every route and screen needs `console.plans.manage`, which the seeded `owner` role holds and `support` and `viewer` do not.

| Route | What |
|---|---|
| `GET /v1/console/plans` | Live plans with their features and how many workspaces hold each |
| `POST /v1/console/plans` | Create. Audited `plan.created` |
| `PATCH /v1/console/plans/{id}` | Edit. The system plan's limits and features too; renaming it is refused. Audited `plan.updated` |
| `DELETE /v1/console/plans/{id}` | Soft delete; refused for the system plan and with `PLAN_IN_USE` while any workspace, deleted ones included, holds it. Audited `plan.deleted` |
| `PUT /v1/console/workspaces/{id}/plan` | Assign. Audited `workspace.plan_changed` with the workspace row before and after |

The screen is `/console/plans`, in the System group of the sidebar: the standard list screen, with the name search in `?search=` and two empty states, none yet and none matching. A row opens the plan sheet: name, tokens a month and storage in MB, each empty for unlimited, and a checkbox per feature; a new plan starts with every feature ticked. The system plan opens with its name read only and a line saying why; its row menu has Edit but no Delete. Deleting asks first. The workspaces table has a plan column, and the workspace sheet a plan picker for an operator with the permission.

Bodies and answers are in [endpoints](../api/endpoints.md#console). A limit is a whole number from 0 to 9007199254740991, the largest a JavaScript number holds exactly, or null for unlimited. Each change writes its `operator_audit` row in the same transaction (CSL-14). Deleted workspaces count as holders because restoring one must find its plan; the console assigns a plan to a deleted workspace for that reason.

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

## Limits

Both limits are read from `workspace_plan` and measured against the [usage](usage.md) figures, so what the settings page shows is what is enforced. The checks live in `server/src/usage/mod.rs`: `ensure_tokens_left` (also `Meter::check`) and `ensure_storage_left`.

### Tokens (PLN-4)

At or past `max_tokens_month`, input plus output over the calendar month in UTC, a model call is refused before the AI service is asked. A refused call sends nothing and writes no `ai_usage` row.

| Check site | Covers |
|---|---|
| `ai/extraction.rs` `parse_receipt` | Receipt scan: web, Telegram, the receipt queue (D95) |
| `ai/extraction.rs` `extract_statement` | Statement import. The job is already accepted (202), so it fails with the code |
| `ai/extraction.rs` `map_columns` | CSV column mapping |
| `ai/extraction.rs` `categorize`, `categorize_items` | Category proposals. A refusal is "no proposal", like any failure of these calls, so a receipt read before the limit still saves |
| `ai/service.rs` `begin_turn` | A chat turn, web and Telegram, before the user's message is written |

The check runs before a call, never during one. A chat turn already streaming when the limit is crossed finishes and is recorded in full; the next turn is refused. A workspace can therefore end a month somewhat past its limit, by at most the calls that were already running.

A queued receipt (D95) refused by the limit stays queued and is retried on the usual backoff, as one queued before a suspension is.

### Storage (PLN-5)

Starting an upload adds the declared size to the stored bytes (`SUM(size)` over ready, live files) and refuses it when the sum would pass `max_storage_bytes`. Reaching the limit exactly is allowed. Nothing is reserved, and files already stored are never touched, even when an operator lowers the limit below what is stored.

Every stored file starts in `vault::service::begin`, the only caller of `vault::insert_file`, so the check is there once:

| Path | Through |
|---|---|
| Vault upload | `POST /v1/vault/files` |
| Receipt upload (web, mobile) | The same route, then `POST /v1/ai/receipt/parse` names the file |
| Statement upload | The same route, then `POST /v1/transactions/import` names the file |
| Chat attachment | The same route; a turn names already uploaded files |
| Telegram receipt photo | `telegram/receipt.rs` `store`, which calls `vault::begin` in process |

Pending uploads are not counted, as the usage page does not count them, and the check is not locked: uploads begun at the same moment can each pass and overshoot by a file each. The daily upload ceiling (SEC-18) bounds both.

### Telegram

The bot answers a refusal with one plain sentence (`render::QUOTA_TOKENS`, `render::QUOTA_STORAGE`), from `telegram/message.rs`, rather than an error. A receipt photo refused for tokens was already stored, so it stays in the vault.

## Refusals

All three refusals are 403. Not 402, because there is no payment to make (PLN-8). Not 429, because 429 means "slow down" and comes with `Retry-After`: a client that honours it would retry a request that fails the same way until the month turns or an operator changes the plan, and storage never frees itself with time. 403 says the request was understood and the caller is who they say, and the workspace's plan does not allow it.

| Code | Status | When |
|---|---|---|
| `QUOTA_TOKENS_EXCEEDED` | 403 | A model call at or past the plan's monthly token limit (OEW-132) |
| `QUOTA_STORAGE_EXCEEDED` | 403 | An upload that would take stored bytes past the plan's limit (OEW-132) |
| `FEATURE_NOT_IN_PLAN` | 403 | A feature the plan does not include, at one of the entry points above; `details.feature` names it (OEW-133) |

## Related docs

- [Usage](usage.md): what is recorded, which a limit is measured against.
- [Console](console.md): where plans are managed.
- [Data model](../data-model.md): the `plans` and `plan_features` tables.
