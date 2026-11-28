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
- The system plan is also never edited, as the system console role `owner` is not ([console](console.md#operators-roles-and-permissions-csl-2-d125)): its name, limits and features change only with a migration. The console shows it read-only.
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
| `PATCH /v1/console/plans/{id}` | Edit; refused for the system plan. Audited `plan.updated` |
| `DELETE /v1/console/plans/{id}` | Soft delete; refused for the system plan and with `PLAN_IN_USE` while any workspace, deleted ones included, holds it. Audited `plan.deleted` |
| `PUT /v1/console/workspaces/{id}/plan` | Assign. Audited `workspace.plan_changed` with the workspace row before and after |

The screen is `/console/plans`, in the System group of the sidebar: the standard list screen, with the name search in `?search=` and two empty states, none yet and none matching. A row opens the plan sheet: name, tokens a month and storage in MB, each empty for unlimited, and a checkbox per feature; a new plan starts with every feature ticked. The system plan opens read only and has no row menu. Deleting asks first. The workspaces table has a plan column, and the workspace sheet a plan picker for an operator with the permission.

Bodies and answers are in [endpoints](../api/endpoints.md#console). A limit is a whole number from 0 to 9007199254740991, the largest a JavaScript number holds exactly, or null for unlimited. Each change writes its `operator_audit` row in the same transaction (CSL-14). Deleted workspaces count as holders because restoring one must find its plan; the console assigns a plan to a deleted workspace for that reason.

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
