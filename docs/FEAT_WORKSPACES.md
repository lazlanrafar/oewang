# Feature: Workspaces & User Management

> See also: [CLAUDE.md](../CLAUDE.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [FEAT_BILLING.md](./FEAT_BILLING.md) · [FEAT_SETTINGS.md](./FEAT_SETTINGS.md)

---

## 🤖 AI Agent: Update This Doc When

- Modifying user, workspace, user-workspace, or invitation schemas in `packages/database/schema/`
- Adding workspace-related endpoints in `apps/api/modules/workspaces/workspaces.controller.ts`
- Changing authorization rules or permissions in `apps/api/modules/workspaces/workspace-permissions.ts`
- Modifying authentication plugin context or token verification in `apps/api/plugins/auth.ts`
- Changing workspace routing, middleware, or switching logic in `apps/app/middleware.ts`

---

## Purpose

Oewang is a multi-workspace SaaS application. Workspaces are isolated logical boundaries for all financial records (wallets, transactions, budgets, categories, etc.). Users can create and belong to multiple workspaces, inviting other users with specific roles (`owner`, `admin`, `editor`, `viewer`) to collaborate.

---

## Data Models

### `users` table

Stores the primary user identity. Accounts are authenticated via custom JWT (email/password or OAuth).

| Column            | Type                   | Notes                                                          |
| ----------------- | ---------------------- | -------------------------------------------------------------- |
| `id`              | `text` (CUID2)         | Primary key                                                    |
| `email`           | `text`                 | Required, unique                                               |
| `name`            | `text`                 | Optional display name                                          |
| `profile_picture` | `text`                 | Optional profile image URL                                     |
| `mobile`          | `text`                 | Optional phone number                                          |
| `oauth_provider`  | `text`                 | e.g. `google`, `github`                                        |
| `providers`       | `text[]`               | Array of OAuth providers linked                                |
| `workspace_id`    | `text` FK → workspaces | Active workspace ID (cached session state)                     |
| `system_role`     | `text`                 | `superadmin` \| `owner` \| `finance` \| `user`. Default `user` |
| `created_at`      | `timestamp`            | Auto                                                           |
| `updated_at`      | `timestamp`            | Auto                                                           |

### `workspaces` table

Represents a tenant / business workspace.

| Column                    | Type                | Notes                                                           |
| ------------------------- | ------------------- | --------------------------------------------------------------- |
| `id`                      | `text` (CUID2)      | Primary key                                                     |
| `name`                    | `text`              | Required display name                                           |
| `slug`                    | `text`              | Unique URL identifier used for workspace URL routing            |
| `country`                 | `text`              | Default country code                                            |
| `plan_id`                 | `text` FK → pricing | Current active pricing plan                                     |
| `plan_status`             | `text`              | `free` \| `active` \| `past_due` \| `cancelled`. Default `free` |
| `plan_billing_interval`   | `text`              | `monthly` \| `annual`                                           |
| `mayar_customer_email`    | `text`              | Linked billing email in Mayar                                   |
| `mayar_transaction_id`    | `text`              | Last Mayar checkout transaction ID                              |
| `plan_started_at`         | `timestamp`         | Start of active billing cycle                                   |
| `plan_current_period_end` | `timestamp`         | End of active billing cycle                                     |
| `ai_tokens_used`          | `integer`           | Month-to-date AI token count. Default `0`                       |
| `ai_tokens_reset_at`      | `timestamp`         | Next reset timestamp                                            |
| `vault_size_used_bytes`   | `bigint`            | Month-to-date vault storage usage in bytes                      |
| `extra_ai_tokens`         | `integer`           | Additional purchased AI token quota                             |
| `extra_vault_size_mb`     | `integer`           | Additional purchased storage quota                              |
| `deleted_at`              | `timestamp`         | Soft delete support                                             |

### `user_workspaces` table (membership join)

Maintains the relationship between users and workspaces, defining access control.

| Column         | Type                   | Notes                                                                        |
| -------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `id`           | `text` (CUID2)         | Primary key                                                                  |
| `workspace_id` | `text` FK → workspaces | Cascade delete                                                               |
| `user_id`      | `text` FK → users      | Cascade delete                                                               |
| `role`         | `text`                 | `owner` \| `admin` \| `editor` (normalized from legacy `member`) \| `viewer` |
| `joined_at`    | `timestamp`            | Auto                                                                         |
| `deleted_at`   | `timestamp`            | Soft delete support                                                          |

### `workspace_invitations` table

Tracks pending invites sent to external users.

| Column         | Type                   | Notes                                                            |
| -------------- | ---------------------- | ---------------------------------------------------------------- |
| `id`           | `text` (CUID2)         | Primary key                                                      |
| `workspace_id` | `text` FK → workspaces | Cascade delete                                                   |
| `email`        | `text`                 | Target invitee email                                             |
| `role`         | `text`                 | Role to assign upon acceptance (`admin` \| `editor` \| `viewer`) |
| `token`        | `text`                 | Unique secure token sent in the invite link                      |
| `status`       | `text`                 | `pending` \| `accepted` \| `expired`                             |
| `expires_at`   | `timestamp`            | Expiration time (typically 7 days from creation)                 |
| `created_at`   | `timestamp`            | Auto                                                             |
| `accepted_at`  | `timestamp`            | Timestamp when invitation was accepted                           |

---

## API Endpoints

### Auth Endpoints

| Method | Path                  | Auth Required | Description            |
| ------ | --------------------- | ------------- | ---------------------- |
| `POST` | `/auth/login`         | None          | Email + password → JWT |
| `POST` | `/auth/register`      | None          | New email user → JWT   |
| `POST` | `/auth/oauth/connect` | None          | OAuth user info → JWT  |

### Workspace Operations

Base path: `/v1/workspaces`

| Method   | Path                  | Role Required | Description                                         |
| -------- | --------------------- | ------------- | --------------------------------------------------- |
| `POST`   | `/`                   | User          | Create a new workspace (assigns creator as `owner`) |
| `GET`    | `/`                   | User          | List all workspaces the user is a member of         |
| `GET`    | `/active`             | Member        | Get details of the active workspace                 |
| `GET`    | `/members`            | Admin+        | List all workspace members                          |
| `GET`    | `/invitations`        | Admin+        | List pending invitations for the workspace          |
| `POST`   | `/invitations`        | Admin+        | Send a new invitation to an email address           |
| `DELETE` | `/invitations/:id`    | Admin+        | Cancel a pending workspace invitation               |
| `POST`   | `/invitations/accept` | User          | Accept an invitation using the unique token         |
| `GET`    | `/billing/history`    | Admin+        | Retrieve order/billing history for this workspace   |

---

## Business Logic

### Workspace Isolation

Every read/write operation (except for global users/auth lookups) is scoped to `workspace_id`. This is enforced at the Repository layer (e.g. `and(eq(table.workspaceId, workspaceId), isNull(table.deletedAt))`).

### Role Hierarchy & Authorization

Actions are restricted based on the user's workspace role:

- **`owner` & `admin`**: Full settings modification, subscription upgrades, billing history, and member management (inviting, canceling, removing).
- **`editor`**: Manage wallets, categories, transactions, budgets, debts, invoices, and upload files to the vault. Cannot manage members or billing.
- **`viewer`**: Read-only access to all dashboards. No modifications allowed.

Role normalization in `workspace-permissions.ts` translates legacy `member` roles directly into `editor`.

### Invitation Flow

1. An Admin/Owner invites a user via email (`POST /v1/workspaces/invitations`).
2. The system generates a CUID2 token, calculates expiration (`expires_at`), saves a row to `workspace_invitations`, and triggers an invite email.
3. Upon registration or login, the user accepts the token (`POST /v1/workspaces/invitations/accept`).
4. The system validates the token:
   - Must be `status = 'pending'`
   - Current time must be `< expires_at`
5. The system creates a `user_workspaces` record linking the user to the workspace with the predefined role.
6. The invitation status transitions to `accepted`.
7. **Auto-Accept Check**: During JWT exchange (`POST /auth/token`), if there are pending invitations matching the user's email, the system automatically accepts them.

---

## Source Files

| Layer      | File                                                        |
| ---------- | ----------------------------------------------------------- |
| Schema     | `packages/database/schema/users.ts`                         |
| Schema     | `packages/database/schema/workspaces.ts`                    |
| Schema     | `packages/database/schema/user-workspaces.ts`               |
| Schema     | `packages/database/schema/workspace-invitations.ts`         |
| Controller | `apps/api/modules/auth/auth.controller.ts`                  |
| Controller | `apps/api/modules/workspaces/workspaces.controller.ts`      |
| Service    | `apps/api/modules/workspaces/workspaces.service.ts`         |
| Repository | `apps/api/modules/workspaces/workspaces.repository.ts`      |
| Security   | `apps/api/modules/workspaces/workspace-permissions.ts`      |
| Plugin     | `apps/api/plugins/auth.ts`                                  |
| Middleware | `apps/app/middleware.ts`                                    |
| Actions    | `apps/app/actions/auth.actions.ts` · `workspace.actions.ts` |
| E2E        | `apps/app/e2e/auth.spec.ts` · `workspaces.spec.ts`          |
| Mobile     | `apps/native/lib/components/organisms/auth/auth_register_screen.dart` + `_view_model.dart` (sign-up: name/email/password/confirm; on success pushes onboarding, **stays logged-out** so the router keeps the auth flow) |
| Mobile     | `apps/native/lib/components/organisms/auth/auth_onboarding_screen.dart` + `_view_model.dart` (single step: workspace name + base currency via `CurrencyCatalog`/`CurrencyPickerScreen` → `POST /workspaces` (always **Free**) → `refreshToken` + `onLoggedIn` into the app. Paid plans are bought later on the web) |
| Mobile     | `apps/native/lib/components/organisms/transactions/transactions_screen.dart` (`_UpgradeBanner`: dismissible home nudge → `url_launcher` opens `${APP_URL}/en/upgrade`) |
| Mobile     | `apps/native/lib/data/repositories/auth_repository.dart` (`register()`), `workspaces_repository.dart` (`create()`) (+ remote/fake each) |
| Mobile     | `apps/native/lib/domain/models/workspace.dart` + `lib/data/dto/workspace_dto.dart` |
| Mobile     | `apps/native/lib/core/router/app_router.dart` (`/login` + `/register` are public; `currentSession()` decodes the JWT — a logged-in user **without** a workspace is routed to `/onboarding`, which itself requires a session so a cleared/expired token falls back to login). `resolveWorkspaceId` (API) only embeds a workspace the user is an **active member** of, so no-workspace tokens carry an empty `workspace_id` (else the auth guard 401s every call). |
| Mobile     | `apps/native/lib/config/dependencies.dart` — `TransactionColorSchemeController` (and any app-root session listener) hydrates server data **only when the session has a `workspaceId`**. A no-workspace session is mid-onboarding; an eager authed read would 401 → the interceptor's 401 handler clears the session → bounce to login. Mirrors the web, whose create-workspace page loads no dashboard data. |

---

## Known Constraints & Edge Cases

- **No Workspaces Fallback**: When a user registers, they have no workspaces. The auth endpoints return `workspace_id: null` in the JWT. The Next.js middleware detects `workspace_id = null` and redirects to `/create-workspace`.
- **Switching Workspaces**: When a user switches workspaces on the client dashboard:
  1. The client calls `PATCH /v1/users/active-workspace` (updates `users.workspace_id`).
  2. The client fetches a new app JWT reflecting the updated `workspace_id`.
  3. The axios client attaches the new token and `x-workspace-id` header to all subsequent API calls.
- **Owner Retention**: A workspace must always have at least one `owner`. The API blocks removing the last workspace owner or downgrading their role.
