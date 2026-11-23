# Feature: Mobile app

Status: v1 draft, 2026-11-23. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md#618-mobile-mob) MOB-1 to MOB-9 and PUSH-1 to PUSH-5. Decisions: [D113 to D116](../architecture.md#decision-log). Tracked as epic OEW-083.

The old Flutter app, ported to `apps/native` and moved onto the new API. Screens the old app had keep their look; the data layer underneath is new.

## Update this doc when

- Adding, removing or restyling a screen, or changing which API route it reads.
- Changing what can be written offline, how the queue replays, or how a conflict is shown.
- Changing a push trigger, its text, or the screen it opens.
- Changing how the app is configured, built, checked or released.

## Shape

```
apps/native/lib/
  config/          env (dart-define), dependency wiring (Riverpod providers)
  core/            Result, Command, router (go_router), theme tokens, money formatting
  data/
    dto/           wire shapes, decimal strings kept as strings
    repositories/  abstract interfaces
    repositories_remote/   one per resource, over ApiClient
    repositories_fake/     in-memory, for widget tests
    repositories_offline/  transactions, wallets, categories: cache reads, queued writes (MOB-6)
    services/api/  ApiClient (Dio), auth interceptor, owe1/ (handshake, envelope)
    services/db/   drift: cached rows and the write queue (MOB-6)
    services/sync/ queue replay and conflict handling (MOB-6, MOB-7)
  domain/models/   what screens use
  components/      atoms, molecules, organisms (screen + view model), layouts
```

This is the old app's structure (MVVM, repository with a fake per interface, Riverpod, go_router), kept so a ported screen moves over with its view model.

## Configuration

Set at build time with `--dart-define-from-file=env/<name>.json`, never from a bundled `.env` asset:

| Key | Meaning |
|---|---|
| `API_URL` | `https://api.oewang.com` in release, `http://10.0.2.2:3002` (Android emulator) or `http://localhost:3002` (iOS simulator) in dev |
| `OWE1_SIGNING_KEYS` | The API's pinned Ed25519 public keys, `kid:base64,...`, same format as the web app's `CRYPTO_SIGNING_PUBLIC_KEYS` |
| `APP_URL` | `https://app.oewang.com`, for links that open the web (legal pages, invitations) |
| `SENTRY_DSN` | Empty disables Sentry |

`apps/native/env/dev.json` is committed for the local stack (iOS simulator on `localhost:3002`). Its key is the one the local API generated on first start, so on another machine replace it with what `GET http://localhost:3002/.well-known/oewang-keys` answers. `apps/native/env/prod.json` is committed too and is what the store builds use; the release workflow checks it against production ([Deployment, Mobile](../deployment.md#mobile)). Other environments' files are gitignored and made where the app is built.

Public keys are not secrets. The FCM config files (`google-services.json`, `GoogleService-Info.plist`) are committed as the old app did; they identify the Firebase project and grant nothing.

## Transport (D113)

- Every request after the handshake is OWE1, sealed and opened by a Dio interceptor (`lib/data/services/api/owe1/`), checked against `owe1-vectors.json` by `test/unit/owe1_vectors_test.dart`. The query string travels only in `X-Owe-Query`. The handshake's `server_time` sets the clock offset every timestamp uses, since a phone's clock is the user's to set. `CRYPTO_SESSION_UNKNOWN` and `CRYPTO_CLOCK_SKEW` run one new handshake and retry once. An unsealed answer other than a marked transport error is refused.
- `Authorization: Bearer <access>`; on `401 UNAUTHENTICATED` the auth interceptor calls `/v1/auth/refresh` once with the stored refresh token, stores the rotated pair, and retries. Concurrent 401s share that one refresh, because reusing a rotated refresh token revokes the family (AUTH-9). A refresh the API refuses (400, 401, 403) clears the tokens and signs out; no answer, a rate limit or a 5xx keeps them and surfaces the error.
- Money arrives and leaves as decimal strings and is held as `Decimal` (package `decimal`). A `double` amount is a bug.
- Nothing logs a token, a key, a decrypted body or file contents (OPS-3). The Dio log interceptor is off in release and prints method, path and status only in debug.

## Screen port map

| Old screen (`references/oewang-old/apps/native/lib/components/organisms/`) | Route(s) |
|---|---|
| `auth/auth_login_screen` | `POST /v1/auth/login`, `/v1/auth/passkey/sign-in/*` |
| `auth/auth_register_screen` | `POST /v1/auth/register` |
| `auth/auth_onboarding_screen` | `POST /v1/workspaces` (name and base currency, D109) |
| splash, `/sync` check | `GET /v1/auth/me`, `GET /v1/workspaces`, `POST /v1/auth/switch-workspace` |
| `transactions/*` daily, calendar, monthly, search | `GET /v1/transactions` |
| `transactions/transactions_summary_screen` | `GET /v1/transactions/summary`, `GET /v1/overview` |
| `transactions/transactions_form_screen` | `POST`, `PATCH`, `DELETE /v1/transactions[/{id}]` |
| `stats/stats_screen` | `GET /v1/transactions/summary`, `GET /v1/overview` |
| `wallets/*` | `/v1/wallets*`, `/v1/wallet-groups*` |
| `categories/*` | `/v1/categories*` |
| `budgets/*` | `/v1/budgets*` |
| `settings/profile` | `/v1/auth/me`, `/v1/auth/me/avatar` |
| `settings/style` | `PUT /v1/auth/me/colors` |
| `settings/currency/settings_main_currency_screen` | `/v1/workspaces/current/currency/*` |
| `settings/workspace/*` | `GET /v1/workspaces`, `POST /v1/auth/switch-workspace` |
| `settings/feedback` | `POST /v1/feedback` |
| new: chat | `/v1/ai/sessions*`, `POST /v1/ai/chat/stream` |
| new: receipt scan | `POST /v1/ai/receipt/parse`, `POST /v1/receipts/pending` |
| new: vault | `/v1/vault/files*` |
| new: Telegram | `/v1/integrations/telegram*` |

Dropped from the old app with their API: debts (and its bottom tab, so the bar has four), contacts, sub-currencies, the separate transaction settings screen, Google and Apple sign-in (OAuth is a non-goal, so the email form shows without the old "Show other options" step), three locales (D15).

What the transaction screens read, and where they differ from the old app:

- A month is loaded whole, every page of `GET /v1/transactions`, so the day, week and calendar groupings never stop at the first 100 rows as the old app did.
- The month's income and expense in the header and the Monthly tab come from `GET /v1/transactions/summary` (D27). Day, week and calendar subtotals add the rows' `base_amount` as `Decimal`, exactly, which is what the API sums too; the summary tab's per-wallet expense adds `amount` within one wallet. `GET /v1/overview` is read by the stats port (M2), not by the transaction tabs.
- The old app's only delete was a swipe that one transaction setting turned on, and that setting went with its API. Deleting is in the edit form's app bar now, behind the same confirm dialog.
- The transaction settings themselves run on the old defaults (month from the 1st, Daily tab first, swipe changes month).
- A member (the read-only role) sees no add button, opens no row for editing and gets no delete (MOB-5).

## Offline (D114, D115)

- Offline writes cover transactions, wallets and categories. Everything else needs a connection and says so.
- Each create gets a CUID2 on the device, used as the row's `id` locally and sent to the API (D114). A transaction made offline can name a wallet or category made offline.
- The queue is a drift table, replayed strictly in order, one request at a time. A create is safe to replay; a `200` for an existing id is success.
- A queued edit carries `If-Match` with the `updated_at` it was based on. `409 STALE` stops that entry and shows the conflict: discard (drop the entry, take `details.current`) or apply anyway (resend without `If-Match`). Later entries for other rows keep going.
- Any other `4xx` marks the entry failed with the API's message, shown in the sync banner; a `5xx` or a network error leaves it queued and retries with backoff.
- A wallet balance shown while entries are queued is the cached balance plus the queued deltas, marked as an estimate. After the queue drains the app refetches and shows the API's figure.

As built (`lib/data/services/{db,sync}`, `lib/data/repositories_offline/`):

- The store is two drift tables written in plain SQL, so there is no codegen step. `cached_rows` holds each row as the JSON the API sent, so `updated_at` goes back as `If-Match` byte for byte; `write_queue` holds kind, op, entity id, the request body, the cached row at queue time (`before_json`, what a discarded failure puts back and the old side of a balance delta), the base `updated_at`, status (`queued`, `sending`, `failed`, `conflict`), the API's message, `details.current` on a conflict, attempts and created_at. Both are keyed by workspace, so a workspace switch neither shows nor replays another workspace's rows.
- A write goes straight to the API when the device is online and nothing is queued or in conflict. Offline, behind a queue, or when that request gets no answer, it is queued and applied to the cache at once. A direct edit sends no `If-Match`, like the web; a queued one always does.
- When an entry lands, the edits queued behind it for the same row take the `updated_at` it answered as their base. A conflict holds back later entries for its row only. Discarding it does not rebase them, so each later edit is checked against the current row in turn rather than applied silently.
- `401` and `429` are retried like a `5xx`. A `404` on a delete counts as done. A refused entry stays in the banner until it is discarded; discarding puts back the row as it was before the change.
- Reads: wallets and categories refresh whole from the API when online and answer from the cache. A whole month of transactions (what the month tabs read) refreshes every page on its first page and answers from the cache; other ranges read the API online and the cached months offline. The month summary falls back to the cached rows' `base_amount` and the last workspace currency seen. A row queued offline holds its own amount as `base_amount` until it syncs, and a queued transfer between two currencies estimates the receiving side with the sent amount.
- Replay runs on start, when connectivity returns, when the app comes back to the foreground, after a workspace change, and on a backoff timer (2 s doubling to 5 min) after a failed attempt. There is no background task.
- A member never queues: the write goes to the API, which refuses it, or the network error is shown.
- Not offline: wallet and category reorder, a wallet's opening balance (`/adjust`), attachments.

## Push (D116)

| Event | Who | `route` |
|---|---|---|
| Queued receipt done | the person who queued it | `/transactions?detail={transaction_id}` |
| Queued receipt failed | the person who queued it | `/vault?file={vault_file_id}` |
| Statement import job done or failed | the person who started it | `/transactions` |
| Budget reaches 80%, then 100% | every member with a device | `/budgets?month=YYYY-MM` |
| Invitation | the invited account, if it exists | `/workspaces` |

The data payload is `{ "route": "/budgets?month=2026-11" }` and the like; the app maps it to a go_router location. Text is built and formatted by the API. The receipt and import routes are the web's own (the receipt notice opens `/transactions?detail=`, the vault opens `?file=`).

- A receipt sent from Telegram is answered in Telegram, where it was sent, and is not pushed.
- The invitation push opens the workspace list, not the accept-invite flow: the invitation token is a credential and a push is shown on a lock screen, so it never carries one. The email, sent either way, holds the link that accepts.
- A budget push goes to members' devices whatever workspace their app has open; the route names the month, not the workspace.
- Devices register through `POST /v1/device-tokens` and are removed through `DELETE /v1/device-tokens` ([endpoints](../api/endpoints.md#auth)). Both need a session with a workspace, because the change is audited in it; the app registers again after creating, joining or switching to one.
- Push is off when `FCM_SERVICE_ACCOUNT_JSON` is unset ([deployment](../deployment.md)).

## Checks

Flutter runs on the host, pinned by `apps/native/.fvmrc` (an exception to running everything in containers: iOS builds need Xcode).

```bash
cd apps/native
fvm flutter analyze
fvm flutter test
```

The end-to-end path against the running stack (sign in through `/sync`, sign up, create a workspace, create, edit and delete a transaction) is an integration test, with screenshots:

```bash
SCREENSHOT_DIR=/tmp/shots fvm flutter drive -d <simulator id> \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/transactions_flow_test.dart \
  --dart-define-from-file=env/dev.json
```

`scripts/ci-local.sh` runs both in its `native` stage.

## Release

Version `2.0.0+7` in `pubspec.yaml`. Store builds come only from `.github/workflows/mobile-release.yml`, run by hand; its secrets, the build number rule and the owner's manual steps are in [Deployment, Mobile](../deployment.md#mobile).

## Related docs

- [PRD](../prd.md#618-mobile-mob) and [decision log](../architecture.md#decision-log)
- [Payload encryption](../api/encryption.md) and [API conventions](../api/conventions.md#idempotency)
- [Legacy app](../reference/legacy-app.md)
