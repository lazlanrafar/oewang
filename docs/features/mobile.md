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
    repositories_offline/  transactions, wallets, categories: cache reads, queued writes; wallet groups: cache reads (MOB-6)
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
| `PASSKEYS_ANDROID` | `true` shows the passkey buttons on Android. Absent or `false` (the default) hides them. Set it in `env/prod.json` only once `ANDROID_CERT_SHA256` holds the release signing key (D119, [Deployment, Mobile](../deployment.md#mobile)) |

`apps/native/env/dev.json` is committed for the local stack (iOS simulator on `localhost:3002`), and `apps/native/env/dev-android.json` is the same file for the Android emulator, which reaches the host at `10.0.2.2`. Their key is the one the local API generated on first start, so on another machine replace it in both with what `GET http://localhost:3002/.well-known/oewang-keys` answers.

Plain HTTP to the local stack is allowed in debug builds only: `android/app/src/debug/` holds a network security config that permits cleartext to `10.0.2.2` and `localhost`, so a release build keeps Android's HTTPS-only default. Dart's own `HttpClient` does not consult that policy (the API calls worked without it); it covers anything going through the platform's network stack. `apps/native/env/prod.json` is committed too and is what the store builds use; the release workflow checks it against production ([Deployment, Mobile](../deployment.md#mobile)). Other environments' files are gitignored and made where the app is built.

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
| new: vault (also the form's attachment tiles, now thumbnails) | `/v1/vault/files*` |
| new: Telegram | `/v1/integrations/telegram*` |

Dropped from the old app with their API: debts (and its bottom tab, so the bar has four), contacts, sub-currencies, the separate transaction settings screen, Google and Apple sign-in (OAuth is a non-goal, so the email form shows without the old "Show other options" step), three locales (D15).

What the transaction screens read, and where they differ from the old app:

- A month is loaded whole, every page of `GET /v1/transactions`, so the day, week and calendar groupings never stop at the first 100 rows as the old app did.
- The month's income and expense in the header and the Monthly tab come from `GET /v1/transactions/summary` (D27). Day, week and calendar subtotals add the rows' `base_amount` as `Decimal`, exactly, which is what the API sums too; the summary tab's per-wallet expense adds `amount` within one wallet. `GET /v1/overview` is read by the stats port (M2), not by the transaction tabs.
- The old app's only delete was a swipe that one transaction setting turned on, and that setting went with its API. Deleting is in the edit form's app bar now, behind the same confirm dialog.
- The transaction settings themselves run on the old defaults (month from the 1st, Daily tab first, swipe changes month).
- A member (the read-only role) sees no add button, opens no row for editing and gets no delete (MOB-5).

What the other screens read, and where they differ from the old app:

| Screen | Reads | Differs |
|---|---|---|
| `settings/members` (new) | `GET /v1/workspaces/current/members` | Read-only list; invites, role changes and removal stay on the web |
| `stats` (Stats, Budget tabs) | `GET /v1/overview` for the period, `GET /v1/budgets?month=` | Category totals and shares are the API's: the top six and one "Other" row, where the old list had every category. The Budget tab's remaining, percent and bar come from the budgets answer |
| `stats` (Note tab) | every page of `GET /v1/transactions` | The API has no per-note total, so the tab adds the rows' `base_amount` (workspace currency) per note, as the old app added amounts |
| `budgets/*` | `/v1/budgets*` | Totals, remaining and percent are the API's, past 100% when over |
| `wallets/*` | `/v1/wallets*`, `/v1/wallet-groups*` | The form's amount is the balance to reach: a change posts it to `/v1/wallets/{id}/adjust`, never a column write, and needs a connection (the wallet itself still saves offline). Assets, Liabilities, Total and the group subtotals on the Accounts tab and the include-in-totals screen are `GET /v1/wallets/totals` (D117): the API converts a foreign wallet at today's rate and the app adds nothing. A foreign wallet's row still shows its own balance in its own currency. When the API left wallets out for want of a rate, a line under the figures says "N left out, no rate", as the web's card does. Group subtotals count only wallets flagged for totals, so an unticked wallet no longer moves its group's figure on the Accounts tab either; the include-in-totals screen's figures catch up once a tick is saved, not as it is tapped. "Include in totals" writes `is_included_in_totals` on each tick and now lists ungrouped wallets. Group and category order is one `sort_order` PATCH per row; wallet order has no screen. The "Card expenses display config" row is gone: it was never saved and the API has no such setting |
| `settings/currency/settings_main_currency_screen` | `/v1/workspaces/current`, `.../currency/preview`, `.../currency/convert` | Owner only. A plain change while no transaction exists; after that, a conversion at a rate the owner confirms. The unit-position and decimal-point rows are gone (never saved) |
| `settings/style` | `PUT /v1/auth/me/colors` | Holds the old income-expense colour choice too, now saved on the user. Blue/red is stored as the default (null); red/blue as `#f87171`/`#60a5fa`. A custom web colour reads as the default |
| `settings/profile` | `/v1/auth/me`, `/v1/auth/me/avatar` | The photo is fetched as bytes, keyed by its version id |
| `settings/feedback` | `POST /v1/feedback` | No screenshot: the route takes none |

Delete Account stays in Settings because the stores require it, and says it is not available: the API has no self-service erase route yet.

## Chat, receipt scan and vault (MOB-8)

Adapted from the web app's screens with the old app's components and tokens.

- **Entry points.** The More tab has an "Assistant" section with Chat and Vault, open to every role. Scan a receipt is a small button above the Trans. tab's add button, shown to writers only (the upload and the read are admin+). The Trans. header's right slot stays reserved for the sync status.
- **Chat.** `/chat` lists sessions (newest first; long press to rename or delete, delete behind a confirm), `/chat/new` makes the session on the first message, `/chat/:id` opens one. `ApiClient.stream` posts the turn and opens each event under `OWE1|sse|session|request|seq` (`owe1/owe1_stream.dart`); a dropped, reordered or unsealed event ends the turn as failed. A stream that closes without `done` or `error` is also a failure. Stop cancels the subscription, which drops the connection (CHAT-9). Tool calls render as the web's one line ("Used N tools" when several); a `delete_transaction` refused with `CONFIRMATION_REQUIRED` (D20) is a failed call, and the assistant's question is answered in the next message.
- **Analyses.** An `artifact` (spending, income, burn rate, budget) is drawn inline under its answer instead of in a side canvas, which a phone has no room for, with hatch bars (D93, `molecules/hatch_bar.dart`). Figures are the API's decimals; bar lengths read a double for geometry only (D89).
- **Not yet on mobile:** Markdown rendering and tappable entity links (text shows the link label only), file attachments in the composer, chat suggestions.
- **Receipt scan.** Camera or gallery through `image_picker`, re-encoded as JPEG at 2000 px and quality 85 (well under the 10 MB vault limit), uploaded in chunks, then `POST /v1/ai/receipt/parse` with the file id. A draft opens the transaction form prefilled (merchant as the name, date, total, the image attached); `RECEIPT_UNREADABLE` or a draft with neither total nor date opens it with only the image (AI-3). `AI_UNAVAILABLE`, `EXTRACTION_NO_ANSWER` or a parse that runs out of time (the client's 30 s wait, or the API's own 30 s `408`) offers `POST /v1/receipts/pending`: the image is already in the vault, so a timeout is a reader that did not answer. The category is not preselected yet, unlike the web.
- **Vault.** `/vault`: search, type (images or PDFs) and sort on the server, 30 per page, tiles from `GET .../thumbnail`. A file opens in a sheet: image preview from the assembled chunks, metadata, "Open or share" through the system share sheet (`share_plus`), and for writers rename and delete, whose confirm says how many transactions lose the file (VLT-11). Tag editing and the linked transaction list stay web-only for now.

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
- Reads: wallets, wallet groups and categories refresh whole from the API when online and answer from the cache, so the account form can still pick a group offline. A whole month of transactions (what the month tabs read) refreshes every page on its first page and answers from the cache; other ranges read the API online and the cached months offline. The month summary falls back to the cached rows' `base_amount` and the last workspace currency seen; the Accounts tab's figures are the last `/v1/wallets/totals` answer kept in the cache, marked "Estimate, syncing" while a transaction or wallet write is queued (the queued deltas are flagged, not added), and it reloads after every transaction save, queued or sent. Offline with no answer ever kept, the tab says it has no connection. A row queued offline holds its own amount as `base_amount` until it syncs, and a queued transfer between two currencies estimates the receiving side with the sent amount.
- Replay runs on start, when connectivity returns, when the app comes back to the foreground, after a workspace change, and on a backoff timer (2 s doubling to 5 min) after a failed attempt. There is no background task.
- A member never queues: the write goes to the API, which refuses it, or the network error is shown.
- Not offline: wallet and category reorder, wallet group writes, a wallet's opening balance (`/adjust`), attachments.

## Push (D116)

| Event | Who | `route` |
|---|---|---|
| Queued receipt done | the person who queued it | `/transactions?detail={transaction_id}` |
| Queued receipt failed | the person who queued it | `/vault?file={vault_file_id}` |
| Statement import job done or failed | the person who started it | `/transactions` |
| Budget reaches 80%, then 100% | every member with a device | `/budgets?month=YYYY-MM` |
| Invitation | the invited account, if it exists | `/workspaces` |

The data payload is `{ "route": "/budgets?month=2026-11" }` and the like; the app maps it to a go_router location and opens the item it names ([in the app](#push-links-telegram-and-passkeys-in-the-app-push-1-mob-9)). Text is built and formatted by the API. The receipt and import routes are the web's own (the receipt notice opens `/transactions?detail=`, the vault opens `?file=`).

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

The M2 screens (accounts and their opening balance, groups, include in totals, categories, a budget and the expense that spends it, stats, profile name, colours, feedback, members, then the read-only role) are `integration_test/m2_screens_flow_test.dart`. It signs in as its own owner and viewer, passed as `--dart-define=M2_EMAIL=... M2_PASSWORD=... M2_VIEWER_EMAIL=... M2_VIEWER_PASSWORD=...`; add `M2_SIGNUP=true` and `M2_VIEWER_SIGNUP=true` on the first run only, since register is rate limited. Push permission is faked out there: the iOS prompt is a system alert that outlives the app and blanks simulator screenshots.

Push registration and taps (each item push opens a transaction, a vault file and a budget month it creates or names, PUSH-5), an invitation link opened signed in (wrong account) and signed out, Telegram's screen and the passkey button run the same way from `integration_test/m5_integrations_flow_test.dart` (PUSH-1, MOB-9). It replaces FCM with a fake (a simulator has no APNs token, and the notification permission dialog cannot be tapped from a test) and needs `--dart-define=M5_USERS=<stamp> --dart-define=M5_RUN=<stamp> --dart-define=M5_PASSWORD=<password>`: keep `M5_USERS` between runs, since registering is rate limited, and change `M5_RUN` every run. Each run makes a workspace the owner owns, and an account may own 10, so about nine runs fill an owner: then start a new `M5_USERS`.

The M4 path (receipt scan, then the vault, then a chat turn over the sealed stream) is `integration_test/m4_ai_flow_test.dart`. It replaces the photo picker's platform with one that returns fixture files, and needs the real AI service. Copy the fixtures out of `~/Documents` first: a simulator app that opens a file there blocks on macOS privacy and freezes.

```bash
mkdir -p /tmp/oew-fixtures && cp integration_test/fixtures/* /tmp/oew-fixtures/
fvm flutter drive -d <simulator id> \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/m4_ai_flow_test.dart \
  --dart-define-from-file=env/dev.json \
  --dart-define=FIXTURES=/tmp/oew-fixtures \
  --dart-define=M4_EMAIL=<email> --dart-define=M4_PASSWORD=<password>
```

Without `M4_EMAIL` it signs up a new account and prints the credentials. The receipt step accepts either outcome: the prefilled form, saved, or the queue offer when the reader does not answer; the run prints `M4_RECEIPT` with which one happened.

`scripts/ci-local.sh` runs the analyzer and `flutter test` in its `native` stage; the device flows run by hand.

## Release

Version `2.0.0+7` in `pubspec.yaml`. Store builds come only from `.github/workflows/mobile-release.yml`, run by hand; its secrets, the build number rule and the owner's manual steps are in [Deployment, Mobile](../deployment.md#mobile).

## Push, links, Telegram and passkeys in the app (PUSH-1, MOB-9)

- **Device token.** `SessionController` tells `PushService` every session change. Each time the session enters a workspace (sign-in, creating, joining or switching to one) the FCM token is registered with `POST /v1/device-tokens`; the first time is when the app asks permission to notify, never on the sign-in screen. A refreshed token is registered while in a workspace. Sign-out sends `DELETE /v1/device-tokens` before the session's tokens are cleared; a failure never blocks it. The token is never logged.
- **Tapping a push.** Cold start, background and foreground (shown by `flutter_local_notifications`, since FCM shows nothing while the app is open) all read `data.route` and map it with `pushLocation`: `/transactions?detail=` to the transactions tab with `detail`, `/vault?file=` to `/vault?file=`, `/transactions` to the transactions tab, `/budgets?month=` to budget settings with `month`, `/workspaces` to More (the workspace switcher). Anything else, or a malformed parameter, opens home; a location no route matches also opens home. While the session loads, the splash keeps the location as `next` and hands it on.
- **The item a push names (PUSH-5).** The screens read the parameter, so a tap opens the item, not just its list:
  - `detail`: the transactions tab loads the row with `GET /v1/transactions/{id}` (offline, or with no answer, the cached row) and opens its edit form over the list. A viewer stays on the list, as a row tap does (MOB-5).
  - `file`: the vault loads the file with `GET /v1/vault/files/{id}` and opens its sheet over the grid.
  - `month`: budget settings shows that month's budgets and spending, named in the title ("Budget, Oct 2026").
  - A deleted or unknown transaction or file (`404`) says so in a snackbar and leaves the list showing; any other error shows its message.
  - `detail` and `file` are dropped from the location as soon as they are read, so tapping the same push again opens the item again.
- **Invitation links.** `https://app.oewang.com/accept-invite?token=` is a universal link (`applinks:app.oewang.com`) and a verified Android app link. Flutter's own deep linking hands it to go_router, so no link package is needed. Signed in, the accept screen accepts, switches the session into the workspace (which registers the device there) and opens home; refused, it says the invitation may be expired, used or for another address, naming the signed-in one, as the web does. Signed out, the token is kept in memory and the person goes to sign up (the API does not reveal the invited address, so nothing is prefilled); after sign-up or sign-in the router brings them back to accept it.
- **Telegram.** Settings, Telegram shows `GET /v1/integrations/telegram`; Link opens the one-time `deep_link` in Telegram and the status reloads when the app resumes; Unlink ends it.
- **Passkeys.** "Sign in with a passkey" on the login screen and "Add a passkey" in Settings run the API's ceremonies through the `passkeys` package. iOS sends the origin `https://app.oewang.com`, which the API's relying party accepts because `webcredentials:app.oewang.com` is in the site's association file. Android sends `android:apk-key-hash:<base64url SHA-256 of the signing certificate>`, which the API accepts only for the fingerprints in `ANDROID_CERT_SHA256` (D119), so the buttons show on Android only in a build with the `PASSKEYS_ANDROID=true` define, and only on Android 9 (API 28) or later, where the package reports support. The package brings Credential Manager and its permissions itself; the app's manifest needs no `asset_statements` entry.
- **Association files.** The web app serves both, public and without cookies: `/.well-known/apple-app-site-association` (invitation links and `webcredentials` for `P9VXA8S55P.com.oewang.app`, fixed in code) and `/.well-known/assetlinks.json` (`handle_all_urls` for the verified invitation link and `get_login_creds` for passkeys, for `com.oewang.app` and the fingerprints in `ANDROID_CERT_SHA256`; `[]` while that is unset, so Android app links stay unverified until then).

## Related docs

- [PRD](../prd.md#618-mobile-mob) and [decision log](../architecture.md#decision-log)
- [Payload encryption](../api/encryption.md) and [API conventions](../api/conventions.md#idempotency)
- [Legacy app](../reference/legacy-app.md)
