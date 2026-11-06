# MCP

External AI apps (Claude Code, Claude Desktop, Cursor, claude.ai and ChatGPT) read and change a person's oewang data over the Model Context Protocol. Decision: [D106](../architecture.md#decision-log). Requirements: MCP-1 to MCP-9 in the [PRD](../prd.md).

## Update this doc when

- A tool is added, removed or renamed (`apps/api/crates/server/src/mcp/tools/`).
- The caps, the confirmation rule or the token rules change.
- The OAuth flow, its lifetimes or the consent page change.

## How a call travels

```
AI app --TLS--> app.oewang.com/mcp   (SvelteKit: relays, sets WWW-Authenticate on 401, 202 on a notification)
SvelteKit --OWE1--> api /v1/mcp      (bearer = the MCP token; JSON-RPC answered in Rust)
api: token by SHA-256 -> workspace inside the grant and a live membership -> role from the membership row
     -> the web's own handler, with source "mcp" on every audit row
```

SvelteKit hosts the public URL so the API keeps no plaintext route and the browser rule (D5) and OWE1 (D22) stay as they are. The relay holds no rule.

Stateless Streamable HTTP: one JSON-RPC message per POST, one JSON answer. No server-sent events, no batches. Methods: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`.

## Tokens

- Made in **Account → MCP**, shown once, kept only as SHA-256 (AUTH-8). They start with `owm_`; the list shows the first twelve characters.
- **Reach:** every workspace the person belongs to (including ones joined later), or a picked set. Either way the membership row is read on every call, so leaving a workspace or being removed ends access to it at once.
- **Expiry:** 30, 90 or 365 days, or none. Revoking ends it immediately. A password change, a password reset and "sign out everywhere" revoke every MCP token too.
- A token is the person's, not a workspace's: any role may make one. What it can do in a workspace is what that person's role allows there.

## OAuth for connector apps (MCP-9)

For apps that sign in instead of taking a pasted token (claude.ai and ChatGPT connectors, Claude Code without `--header`).

| Step | Where | What holds |
|---|---|---|
| Discovery | `/.well-known/oauth-protected-resource[/mcp]`, `/.well-known/oauth-authorization-server` (app) | Built from the request's origin; `/mcp`'s 401 points at the first |
| Registration | `POST /oauth/register` (app) → `/v1/oauth/register` | Public clients only (`none` auth). Redirect URIs: https, http to localhost/127.0.0.1/[::1], or an app's own scheme; never `javascript:`, `data:`, `file:` and the like. The name is the app's claim and the consent page says so |
| Consent | `/oauth/authorize` (app page, session required) | Never redirects until the client exists and the redirect URI is one it registered, exactly. `response_type=code` and PKCE S256 are required. The person picks every workspace or some. Not frameable |
| Code | `/v1/oauth/authorize` | Single use, ten minutes, bound to client, redirect URI and challenge; stored as SHA-256 |
| Token | `POST /oauth/token` (app, form or JSON) → `/v1/oauth/token` | The code is claimed in one statement before anything is compared, so a failed check spends it. Access token one hour, refresh token thirty days, rotated on every use; presenting a spent refresh token revokes the whole grant |

The tokens are rows of `mcp_tokens` with `kind = 'oauth'`, so every call re-reads the membership exactly as for a personal token. Connected apps are listed in Account → MCP, one row per grant, and Disconnect ends every rotation of it. Registration and the token endpoint are answered with `Access-Control-Allow-Origin: *` because they carry no cookie. Known gap: the API's rate limiter sees the app server's address for these, as it does for login, so they share one anonymous bucket; unused registrations are not yet pruned.

## Tools

One registry in Rust (`mcp/tools/*.rs`). Every tool deserializes its arguments into the web's own body or query type and calls the web's own handler, so every rule holds unchanged: role gates, soft delete, audit rows, wallet locks, currency locks, one budget per category, the last-owner and owner-protection rules, invite email binding. Money is a decimal string both ways; every figure comes formatted by the API (D27).

| Area | Tools |
|---|---|
| Workspaces | `list_workspaces`, `get_workspace`, `update_workspace` (name, country) |
| Transactions | `list_transactions`, `get_transaction`, `get_transaction_history`, `get_transaction_summary`, `create_transaction`, `update_transaction`, `delete_transaction`, `import_transactions` |
| Line items | `add_transaction_item`, `update_transaction_item`, `delete_transaction_item` |
| Wallets and groups | `list_wallets`, `get_wallet`, `create_wallet`, `update_wallet`, `set_default_wallet`, `adjust_wallet_balance`, `delete_wallet`, `list_wallet_groups`, `create_wallet_group`, `update_wallet_group`, `delete_wallet_group` |
| Categories | `list_categories`, `create_category`, `update_category`, `delete_category` |
| Budgets | `get_budget_status`, `create_budget`, `update_budget`, `delete_budget` |
| Reports | `get_overview`, `get_spending_analysis`, `get_income_summary`, `get_burn_rate` |
| Database | `list_items`, `get_item_history`, `list_exchange_rates`, `list_currencies` |
| Vault | `list_files`, `get_file` (metadata only), `update_file`, `delete_file` |
| Members | `list_members`, `list_invites`, `invite_member`, `revoke_invite`, `update_member_role`, `remove_member` |
| Settings | `get_assistant_settings`, `update_assistant_settings`, `send_feedback` |

When a token reaches more than one workspace, every tool takes a required `workspace_id`; `list_workspaces` lists the ids. With one workspace in reach the argument is not offered.

`import_transactions` is the web's CSV import: the client reads the file and sends rows as column-to-text maps with a column mapping, into one wallet per call. Fingerprints make a re-import a no-op (TXN-16), and rows are audited as `import`, as the web's are. Transfers are not an import shape; send them with `create_transaction`.

Deliberately not exposed: deleting a workspace, converting its currency, anything about the account (password, sessions, photo, MCP tokens themselves), file bytes (upload, download, thumbnails), and the bulk update and delete routes.

## Caps and confirmation

Per token, per rolling minute, minted by the API (the client cannot reset it): 120 calls, 30 writes, 5 deletes. The amount ceiling of every write path still applies.

Every delete is two calls. The first deletes nothing and answers `CONFIRMATION_REQUIRED`; the same call with `confirmed: true` within five minutes deletes. The challenge is keyed by token and the exact call. Tools carry `readOnlyHint` and `destructiveHint`, so clients ask the person before writing. The API cannot prove a human answered between the two calls; soft delete keeps every delete reversible, and the audit source `mcp` keeps it traceable.

## Screens

**Account → MCP** (`/account/mcp`, also in the avatar menu): the server URL, setup per client (tab in `?client=`: Claude Code, claude.ai and ChatGPT, Cursor, Claude Desktop, other), the token list with a New token sheet (name, all or picked workspaces, expiry) that shows the token once, and Connected apps with Disconnect.

**Consent** (`/oauth/authorize`): the app's name marked unverified, where the answer goes, what it may do, the workspace choice, Allow and Deny.
