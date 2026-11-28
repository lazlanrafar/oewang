# Feature: Operator console

Status: v0.1, 2026-11-25. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md) CSL-1 to CSL-14, and the plan screens of PLN-1 to PLN-3. Decisions D124, D125, D126, D128. Epic OEW-123, stories US-080 to US-085.

Where the people who run oewang see users, workspaces, feedback and usage across every workspace, and suspend, restore or disable when they must. It is built for privacy first: an operator manages accounts, never reads anyone's money.

## Update this doc when

- Adding a console screen, route or permission.
- Changing what an operator can see about a user or a workspace.
- Changing how the console host is gated, or how an operator is recognised.

## What an operator never sees (CSL-13)

No amount, balance, note, description or transaction name, and no way to sign in as a user. Counts (wallets, transactions), storage bytes and token totals are the most an operator sees of a workspace's contents. Every console query lives in `repositories/console.rs`, where this rule can be reviewed in one file, and a test fails when a console response carries one of those keys (US-081).

## The host (CSL-1, D124)

The console is the same SvelteKit app, reached as `console.oewang.com`.

| Request | On the console host | On any other host |
|---|---|---|
| `/console/...` | Served, after the checks below | 404 |
| `/` | Redirects to `/console`, where Cloudflare Access lands an operator | Served as usual |
| `/login`, `/logout`, `/health` | Served | Served |
| Anything else | 404 | Served as usual |

`CONSOLE_HOST` names the host; unset, there is no console anywhere. The session cookies are `__Host-` cookies, bound to one host, so signing in to the console does not sign anyone in to the app or the other way round.

In front of the host, Cloudflare Access admits only the email addresses on its policy. Cloudflare then adds a signed `Cf-Access-Jwt-Assertion` header, and `hooks.server.ts` verifies it (signature against the team's published keys, audience `CF_ACCESS_AUD`, expiry) before anything else, so a request that reaches the origin directly is refused with 403. Outside production the check is skipped, because there is no Cloudflare in front of a laptop.

After Access, the operator signs in with their ordinary oewang email and password. A sign-in on the console host lands on `/console`, not on the workspace check page, and the console never requires a workspace. The console's sign-in page shows the form alone: registering, password reset and passkeys live on the app host, and a passkey is bound to the app's origin. A person signed in on the console host without a role gets a 403 page whose only way forward is signing out, because `/login` sends a signed-in session back to `/console`.

## Operators, roles and permissions (CSL-2, D125, D126)

An operator is a user with `users.console_role_id` set. A role is a row in `console_roles` with a set of permissions in `console_role_permissions`. Permissions are a fixed list, `ConsolePermission` in `domain/src/console.rs`, because each one is a check in a route.

| Permission | owner | support | viewer |
|---|---|---|---|
| `console.read` | ✓ | ✓ | ✓ |
| `console.feedback.write` | ✓ | ✓ | |
| `console.users.disable` | ✓ | ✓ | |
| `console.workspaces.suspend` | ✓ | | |
| `console.workspaces.restore` | ✓ | | |
| `console.operators.manage` | ✓ | | |
| `console.roles.manage` | ✓ | | |
| `console.audit.read` | ✓ | | |
| `console.plans.manage` | ✓ | | |

These are the seeded roles. `owner` is a system role: its permissions cannot be changed and it cannot be deleted, so there is always a role that can manage the rest. `support` and `viewer` can be edited like any role made later (US-085).

The `Operator` extractor in `server/src/console/operator.rs` verifies the session token, then reads the person's live role and its permissions from the database, on every console request. A handler calls `operator.require(ConsolePermission::...)` before anything else. No role, a deleted role, or a missing permission all answer 403 `CONSOLE_FORBIDDEN`. Because nothing is cached in the token, removing someone's role takes effect on their next request.

The app reads `GET /v1/console/me` once per navigation and builds the sidebar from `permissions`. Hiding a link is a courtesy; the API's check is the control.

The first owner is set by hand, once per environment:

```sql
UPDATE users SET console_role_id = 'owner' WHERE lower(email) = lower('<the owner email>');
```

## Suspend, restore, disable (CSL-5 to CSL-7, D127)

| Action | Permission | Effect |
|---|---|---|
| Suspend, unsuspend a workspace | `console.workspaces.suspend` | Every channel refuses the workspace with `WORKSPACE_SUSPENDED`: web, mobile, Telegram, MCP, the AI service's tool calls, queued receipts, and statement imports between their extraction and their write. Its members can still sign in, list their workspaces, switch to another and sign out. Nothing is deleted or revoked, so unsuspending is the whole undo. A deleted workspace is restored first |
| Restore a workspace | `console.workspaces.restore` | Clears `deleted_at`. Data was never removed (OPS-2), so the workspace comes back as it was |
| Disable, enable a user | `console.users.disable` | A disabled person cannot sign in (`USER_DISABLED`), and every refresh token, Telegram link and MCP token they held is revoked in the same transaction. Enabling lets them sign in again; links and tokens are made anew. Operators cannot be disabled, the caller included: revoke the console role first |

The mobile app shows its own words for `WORKSPACE_SUSPENDED` and `USER_DISABLED` (`dio_error_mapper.dart`) rather than the API's developer message; a suspended member switches workspace from More. Repeating an action changes nothing and writes no audit row. The buttons sit in the sheet header, shown only to an operator with the permission, each behind a confirmation that says what it does. A member who opens a suspended workspace sees a page saying so, with the way to another workspace (`/workspaces`, which stays open) and to sign out. Every change writes one `operator_audit` row with the entity's console row before and after (CSL-14). Where each check sits is in [security/auth.md](../security/auth.md#disabled-users-and-suspended-workspaces-d127).

## Feedback, usage and health (CSL-8 to CSL-10)

- **Feedback.** Every workspace's feedback, newest first, with its sender and workspace. An operator with `console.feedback.write` marks it done or reopens it and keeps an internal note, which the sender never sees. The message is shown in full: it is what the person chose to send to oewang.
- **Overview.** Users (and new this week), workspaces by status, open feedback, tokens this month, and sign-ups per week for twelve weeks.
- **Usage.** One calendar month in UTC, `?month=YYYY-MM`: totals, the top fifty workspaces, and each model and feature, in tokens. A price per token would need a table kept in step with every provider, so money is out (CSL-9).
- **Health.** Receipt jobs waiting and failed, and model calls per day for fourteen days, from the database. Errors and deploys stay in Sentry and Coolify; the page links to them when `CONSOLE_SENTRY_URL` and `CONSOLE_COOLIFY_URL` are set.

## Operators and roles (CSL-11, CSL-12, D125)

Three rules keep the roles from being a way up:

- **Nobody hands out what they do not hold.** A role is created or edited only with permissions the editor holds, an existing role is edited only when the editor holds all of it, and a role is granted to, or taken from, a person only when the granter holds all of that role.
- **Nobody changes their own role**, neither by reassigning themselves nor by editing the role they hold.
- **There is always an owner.** `owner` is a system role that cannot be edited or deleted, and the last person holding it cannot lose it.

A role somebody holds cannot be deleted (`CONSOLE_ROLE_IN_USE`); deleting is soft, so the audit trail can still name it. A disabled user is enabled before being made an operator. Every change is an `operator_audit` row, and owners read the trail on the operator audit screen.

## The shell

The console is drawn in the app's own shell, not a look of its own: `organisms/layouts/layouts-app-shell.svelte` is the dashboard's sidebar, header and content area, shared by both. The console passes its own sidebar groups (`consoleNavFor`, filtered by the operator's permissions) and a brand row in place of the workspace switcher; the account menu shows the operator's role under the email, and has no account links, because `/account` is not served on the console host. Every console table is `molecules/data-table` with a column file per D81, and list screens carry no visible title. Overview, usage and health are stat cards and hatched charts (D93), as the app's overview is.

## Screens

| Screen | Permission | Story |
|---|---|---|
| Users, a user | `console.read` | US-081. `/console/users`, the user's sheet at `?user=`: email, name, status, joined, last active, console role and memberships |
| Workspaces, a workspace | `console.read` | US-081. `/console/workspaces` with an Active, Suspended or Deleted facet and a plan column, the sheet at `?workspace=`: owner, plan, members, counts, storage, tokens this month |
| Suspend, restore, disable | the matching write permission | US-082 |
| Feedback | `console.read`, `console.feedback.write` to change status | US-083. `/console/feedback`, the sheet at `?feedback=`, read on its own so it stays open when the filter hides the row |
| Usage, health, overview | `console.read` | US-084 |
| Operators, roles, operator audit | `console.operators.manage`, `console.roles.manage`, `console.audit.read` | US-085 |
| Plans, a workspace's plan | `console.plans.manage` | OEW-131. `/console/plans`: the search in `?search=`, New plan on the right, the plan sheet (name, tokens a month, storage in MB, empty for unlimited, and the six features); the system plan keeps its name and cannot be deleted, but its limits and features are edited like any plan's. The workspace sheet shows a plan picker (`molecules/select-plan`) to an operator with the permission, saved through the page's `?/plan` action. See [plans](plans.md#console-oew-131) |
