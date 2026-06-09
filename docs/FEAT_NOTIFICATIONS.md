# Feature: Notifications & Alerts

> See also: [CLAUDE.md](../CLAUDE.md) · [FEAT_WORKSPACES.md](./FEAT_WORKSPACES.md) · [FEAT_INTEGRATIONS.md](./FEAT_INTEGRATIONS.md) · [FEAT_BILLING.md](./FEAT_BILLING.md)

---

## 🤖 AI Agent: Update This Doc When

- Modifying notification, notification-settings, or push-subscription schemas in `packages/database/schema/`
- Adding endpoints to `apps/api/modules/notifications/notifications.controller.ts` or `push-subscriptions.controller.ts`
- Changing how notifications are dispatched or constructed in `apps/api/modules/notifications/notifications.service.ts`
- Changing service-worker behavior or push registration in `apps/app/`

---

## Purpose

The Notifications system alerts users about critical account events (budget threshold warnings, plan subscription changes, member joins, invoices generated). Alerts can be delivered in-app (realtime alerts/list), via email, or via push notifications (Web Push protocol using VAPID).

---

## Data Models

### `notifications` table

Stores individual notification logs generated for users in a workspace.

| Column         | Type                   | Notes                                                                    |
| -------------- | ---------------------- | ------------------------------------------------------------------------ |
| `id`           | `text` (CUID2)         | Primary key                                                              |
| `workspace_id` | `text` FK → workspaces | Workspace link                                                           |
| `user_id`      | `text` FK → users      | Target recipient user                                                    |
| `type`         | `text`                 | e.g. `budget.exceeded`, `integration.connected`, `subscription.expiring` |
| `title`        | `text`                 | Header title text                                                        |
| `message`      | `text`                 | Main body content                                                        |
| `is_read`      | `boolean`              | Read status. Default `false`                                             |
| `link`         | `text`                 | Target redirect URL inside the application dashboard                     |
| `created_at`   | `timestamp`            | Auto                                                                     |
| `deleted_at`   | `timestamp`            | Soft delete support                                                      |

### `notification_settings` table

User preferences for notification delivery channels.

| Column              | Type                   | Notes                                                    |
| ------------------- | ---------------------- | -------------------------------------------------------- |
| `id`                | `text` (CUID2)         | Primary key                                              |
| `workspace_id`      | `text` FK → workspaces | Workspace link                                           |
| `user_id`           | `text` FK → users      | User link                                                |
| `email_enabled`     | `boolean`              | Allow email alerts. Default `true`                       |
| `whatsapp_enabled`  | `boolean`              | Allow WhatsApp alerts (Pro plan feature). Default `true` |
| `push_enabled`      | `boolean`              | Allow browser push notifications. Default `true`         |
| `marketing_enabled` | `boolean`              | Allow news and feature updates. Default `false`          |
| `created_at`        | `timestamp`            | Auto                                                     |
| `updated_at`        | `timestamp`            | Auto                                                     |
| `deleted_at`        | `timestamp`            | Soft delete support                                      |

### `push_subscriptions` table

Saves browser Web Push subscription tokens.

| Column         | Type                   | Notes                                                                      |
| -------------- | ---------------------- | -------------------------------------------------------------------------- |
| `id`           | `text` (CUID2)         | Primary key                                                                |
| `user_id`      | `text` FK → users      | User link                                                                  |
| `workspace_id` | `text` FK → workspaces | Workspace link                                                             |
| `endpoint`     | `text`                 | Unique browser push service URL (e.g. google / mozilla push endpoint)      |
| `subscription` | `text`                 | Full JSON string representation of the browser's `PushSubscription` object |
| `created_at`   | `timestamp`            | Auto                                                                       |

---

## API Endpoints

### In-App Notifications

Base path: `/v1/notifications`

| Method   | Path         | Role Required | Description                                           |
| -------- | ------------ | ------------- | ----------------------------------------------------- |
| `GET`    | `/`          | User          | List paginated notifications for the active workspace |
| `PATCH`  | `/mark-read` | User          | Mark specified notifications as read                  |
| `DELETE` | `/:id`       | User          | Soft-delete a notification                            |

### Notification Settings

Base path: `/v1/notification-settings`

| Method  | Path | Role Required | Description                           |
| ------- | ---- | ------------- | ------------------------------------- |
| `GET`   | `/`  | User          | Retrieve current settings preferences |
| `PATCH` | `/`  | User          | Update preferences                    |

### Push Subscriptions (Web Push)

Base path: `/v1/push-subscriptions`

| Method   | Path         | Role Required     | Description                               |
| -------- | ------------ | ----------------- | ----------------------------------------- |
| `GET`    | `/vapid-key` | Any authenticated | Retrieve the backend VAPID Public Key     |
| `POST`   | `/`          | User              | Register a new browser `PushSubscription` |
| `DELETE` | `/`          | User              | Unregister a browser subscription         |

---

## Business Logic

### Notification Dispatch Workflow

When an event triggers a notification (e.g., budget exceeded in `BudgetsService`):

1. **Database Insert**: Creates a `notifications` record.
2. **Channel Resolution**: Retrieves `notification_settings` for the user.
3. **Dispatch Channels**:
   - **In-App**: Handled via `RealtimeService.notifyValueChange(workspaceId, "notifications")` (WebSocket updates the UI shell instantly).
   - **Email**: Uses `@workspace/email` SMTP templates if `email_enabled = true`.
   - **Push Notification**: If `push_enabled = true`, triggers `PushSubscriptionsService.sendToUser()`.

### Web Push Mechanism (web-push)

1. The frontend asks the user for notification permissions and retrieves a `PushSubscription` object.
2. The frontend POSTs this object to `/v1/push-subscriptions`.
3. When sending:
   - The backend checks for all registered endpoints for the user ID.
   - Using the VAPID keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) and subject details, it signs and sends the payload to each endpoint using the `web-push` library.
   - **Invalidation Handling**: If the push endpoint returns a `410 Gone` error (meaning the user revoked permission or the subscription expired), the backend automatically deletes the subscription row from the database.

---

## Source Files

| Layer       | File                                                                         |
| ----------- | ---------------------------------------------------------------------------- |
| Schema      | `packages/database/schema/notifications.ts`                                  |
| Schema      | `packages/database/schema/notification-settings.ts`                          |
| Schema      | `packages/database/schema/push-subscriptions.ts`                             |
| Controller  | `apps/api/modules/notifications/notifications.controller.ts`                 |
| Controller  | `apps/api/modules/notification-settings/notification-settings.controller.ts` |
| Controller  | `apps/api/modules/push-subscriptions/push-subscriptions.controller.ts`       |
| Service     | `apps/api/modules/notifications/notifications.service.ts`                    |
| Service     | `apps/api/modules/notification-settings/notification-settings.service.ts`    |
| Service     | `apps/api/modules/push-subscriptions/push-subscriptions.service.ts`          |
| Repository  | `apps/api/modules/notifications/notifications.repository.ts`                 |
| Repository  | `apps/api/modules/notification-settings/notification-settings.repository.ts` |
| Repository  | `apps/api/modules/push-subscriptions/push-subscriptions.repository.ts`       |
| Web Service | `apps/app/public/sw.js` (service worker implementation)                      |

---

## Known Constraints & Edge Cases

- **VAPID Keys configuration**: VAPID public/private key pairs must be set in environmental variables. If they are missing in dev, the server registers subscriptions but quietly skips sending push events without throwing exceptions.
- **WebSocket updates**: When a notification is marked as read or deleted, a WebSocket frame is broadcast to update the unread count icon on other browser sessions.
