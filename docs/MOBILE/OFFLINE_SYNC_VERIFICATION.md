# Native offline sync verification

Verified on 2026-09-09. This report covers the offline-first follow-up in `apps/native` and the supporting API changes. It distinguishes automated evidence from device verification.

## Changes verified

- Mounted the sync trigger in the actual app root; startup, connectivity recovery, foreground retry, and app resume now reach the queue processor.
- Matched the bulk API contract by sending transaction amounts as strings.
- Forwarded the client-generated debt ID through `DebtsService`; replay does not create a new debt.
- Scoped transaction replay lookups to live rows in the authenticated workspace; unavailable IDs reject the bulk transaction.
- Kept transaction rows, balance deltas, attachments, and audit writes in one database transaction. Updates lock the original transaction row before applying balance changes. Missing wallets fail the write. Bulk notifications follow commit.
- Synced wallets before dependent transactions; a pending wallet blocks its transactions until confirmed.
- Added monotonic local revisions. Delayed acknowledgements cannot discard edits made while requests are in flight. A replay that returns an older create payload queues an update.
- Added a foreground retry clock with exponential backoff capped at five minutes. Long retry histories do not overflow the backoff calculation. Failure responses never count as acknowledgements.
- Bound sync requests to their expected workspace before transmitting the JWT. Workspace switches stop later queue requests; missing/malformed tokens reject safely. An old 401 does not clear a new session.
- Added a shared pending/error banner with per-record error details.
- Added monthly budget snapshots, partitioned by workspace and month/year. Budget writes remain online-only.
- Migrated local SQLite v1 → v2 without clearing pending writes.
- Corrected the existing bottom-nav widget test: Stats is index 2 in the current five-tab navigation.

## Automated results

| Check | Result |
| --- | --- |
| `cd apps/native && flutter test` | **132 passed**, 0 failures |
| `cd apps/api && bun test modules/` | **372 passed**, 0 failures across 21 files; includes a wrapper that separately runs **7 passing service cases** |
| `bun run typecheck` | **16/16 workspace tasks successful** |
| `cd apps/api && bun run build` | Successful Bun bundle |
| Biome error-level lint on changed API areas | No errors |
| `flutter analyze --no-pub` | **No issues found** |
| `bun run lint` | **9/9 tasks successful**; existing non-fatal warnings remain |
| `flutter test integration_test/offline_sync_test.dart -d <simulator-id>` | **1 passed** on iPhone 17 Pro / iOS 26.5 |

The initial Turbo sandbox crash was resolved by running the root checks with system access. The web notification row now uses a semantic button with separate action buttons. Native reorder callbacks use `onReorderItem` without applying the old index adjustment twice; regression tests cover moves in both directions. The shared back-label header now constrains long labels to prevent overflow.

## Regression inventory

| File (relative to `apps/native/test/`) | Coverage |
| --- | --- |
| `unit/sync_service_test.dart` | Partial batch acknowledgement, failures, backoff, very large retry counts, workspace boundaries, batch payload, wallet dependencies, create replay, edits during create/update requests, overlapping flush requests, explicit nullable update fields, derived debt fields |
| `unit/offline_repositories_test.dart` | Queued create/edit, CUID2 format, cache fallback, workspace isolation, authorization errors, stale filtered records, late network responses, wallet/debt edits, month-scoped budgets, logout cache removal |
| `unit/offline_database_test.dart` | File-backed SQLite migration preserving a queued v1 wallet |
| `unit/sync_auth_test.dart` | Expected workspace matches/mismatches, absent/malformed token rejection, old 401 versus new session |
| `unit/sync_trigger_test.dart` | Startup/connectivity/foreground retry/resume and timer disposal |
| `widget/sync_status_banner_test.dart` | Hidden empty state, visible pending count, expandable failed-record details |
| `widget/catalog_reorder_test.dart` | Category and wallet-group moves down/up using the final destination index; header layout without overflow |

API repository cases live in `apps/api/modules/transactions/__tests__/offline-sync.repository.test.ts`. Service cases live in `apps/api/test/unit/offline-sync.service.test.ts`; the module-suite wrapper runs them in a fresh process because other suites use global partial module mocks.

Repository and service tests use fakes/spies to check contracts and transaction-connection propagation. They do **not** prove rollback/concurrency against a live PostgreSQL instance. The native tests use actual SQLite (memory and temporary file), but fake API responses.

## Simulator integration result

`apps/native/integration_test/offline_sync_test.dart` passed on a booted **iPhone 17 Pro simulator running iOS 26.5**. It exercises real file-backed SQLite, Keychain-backed secure storage, Dio, AES-GCM request/response encryption, and a loopback HTTP server running inside the simulator. Only the connectivity signal is faked; stopping/restarting the HTTP server creates a real connection failure/recovery.

The test creates an offline wallet, transaction, and debt, edits the transaction, verifies cached reads, closes/reopens the SQLite database, checks the pending banner, reconnects, and verifies exactly three create requests with a final server-fixture wallet balance of 75 from an opening balance of 100 and expense of 25. Re-running flush sends no duplicate creates. Temporary data and the test Keychain entry are removed after the test.

The local HTTP fixture is **not the Elysia API** and accepts a fixture JWT; it validates encryption and request shape rather than real JWT signatures/membership. API unit contracts remain separately verified. The iOS Pod lockfile now includes the existing connectivity and SQLite plugin dependencies resolved during this build. CocoaPods reported a non-blocking Swift Package Manager support notice for `flutter_secure_storage`.

## Live-backend device walkthrough still required

No manual airplane-mode walkthrough against a live API was performed. The successful simulator integration test is narrower than a production/staging end-to-end sign-off.

Use a dedicated development account/workspace:

1. Open the app online and load transactions, wallets, debts, categories, contacts, and the current month's budgets.
2. Disable network access. Create a wallet, create a transaction using that wallet, and create/edit a debt. Confirm local lists and the pending count update.
3. Restart the app offline. Confirm cached records and pending work survive.
4. Restore connectivity. Confirm wallet creation precedes transaction sync, the pending count clears, and the server has exactly one record per client ID with correct balances.
5. Interrupt connectivity during a request, edit the queued record, then reconnect. Confirm the latest edit reaches the server without another create or duplicated balance delta.
6. Switch workspaces while sync is pending; verify old-workspace rows never appear in the new workspace. Exercise a validation failure and inspect its row in the error banner.

## Deliberate limits

- Last-write-wins remains the conflict policy.
- Sync runs while the app is foregrounded, not as an OS background task after the app is killed.
- Offline writes cover create/update for transactions, wallets, and debts. Payments, deletes, catalog/settings edits, and budget mutations still require connectivity.
- Only previously fetched data is available offline. Budget status and cached wallet balances reflect server snapshots; they are not a full local recomputation of all unsynced financial effects.
- Logout still clears the local cache, including unsynced changes. There is no pending-write logout confirmation flow in this scope.
- No production database changes or deployment were performed. SQLite v2 is a local-cache migration; there is no PostgreSQL schema migration for this change.
