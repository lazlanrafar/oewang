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

## Refusals

| Code | When |
|---|---|
| `QUOTA_TOKENS_EXCEEDED` | A model call at or past the plan's monthly token limit (OEW-132) |
| `QUOTA_STORAGE_EXCEEDED` | An upload that would take stored bytes past the plan's limit (OEW-132) |
| `FEATURE_NOT_IN_PLAN` | A feature the plan does not include (OEW-133) |

## Related docs

- [Usage](usage.md): what is recorded, which a limit is measured against.
- [Console](console.md): where plans are managed.
- [Data model](../data-model.md): the `plans` and `plan_features` tables.
