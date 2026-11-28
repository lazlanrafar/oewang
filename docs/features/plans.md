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

| Key | Entry points |
|---|---|
| `chat` | Web chat stream |
| `telegram` | Telegram link and webhook |
| `receipt_scan` | Receipt scan |
| `statement_import` | Statement import |
| `mcp` | MCP token use and tool calls |
| `vault` | Vault upload |

Which entry points check which feature, and what stays readable when a feature is removed, is specified with OEW-133.

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

Both limit refusals are 403. Not 402, because there is no payment to make (PLN-8). Not 429, because 429 means "slow down" and comes with `Retry-After`: a client that honours it would retry a request that fails the same way until the month turns or an operator changes the plan, and storage never frees itself with time. 403 says the request was understood and the caller is who they say, and the workspace's plan does not allow it.

| Code | Status | When |
|---|---|---|
| `QUOTA_TOKENS_EXCEEDED` | 403 | A model call at or past the plan's monthly token limit (OEW-132) |
| `QUOTA_STORAGE_EXCEEDED` | 403 | An upload that would take stored bytes past the plan's limit (OEW-132) |
| `FEATURE_NOT_IN_PLAN` | OEW-133 | A feature the plan does not include (OEW-133) |

## Related docs

- [Usage](usage.md): what is recorded, which a limit is measured against.
- [Console](console.md): where plans are managed.
- [Data model](../data-model.md): the `plans` and `plan_features` tables.
