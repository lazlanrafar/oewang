# Feature: Operator console

Status: v0.1, 2026-11-25. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md) CSL-1 to CSL-14. Decisions D124, D125, D126. Epic OEW-123, stories US-080 to US-085.

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

These are the seeded roles. `owner` is a system role: its permissions cannot be changed and it cannot be deleted, so there is always a role that can manage the rest. `support` and `viewer` can be edited like any role made later (US-085).

The `Operator` extractor in `server/src/console/operator.rs` verifies the session token, then reads the person's live role and its permissions from the database, on every console request. A handler calls `operator.require(ConsolePermission::...)` before anything else. No role, a deleted role, or a missing permission all answer 403 `CONSOLE_FORBIDDEN`. Because nothing is cached in the token, removing someone's role takes effect on their next request.

The app reads `GET /v1/console/me` once per navigation and builds the sidebar from `permissions`. Hiding a link is a courtesy; the API's check is the control.

The first owner is set by hand, once per environment:

```sql
UPDATE users SET console_role_id = 'owner' WHERE lower(email) = lower('<the owner email>');
```

## Screens

| Screen | Permission | Story |
|---|---|---|
| Users, a user | `console.read` | US-081 |
| Workspaces, a workspace | `console.read` | US-081 |
| Suspend, restore, disable | the matching write permission | US-082 |
| Feedback | `console.read`, `console.feedback.write` to change status | US-083 |
| Usage, health, overview | `console.read` | US-084 |
| Operators, roles, operator audit | `console.operators.manage`, `console.roles.manage`, `console.audit.read` | US-085 |
