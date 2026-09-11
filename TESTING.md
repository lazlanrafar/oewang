# Testing

Verification snapshot: **2026-09-11**, native contacts-import follow-up.

| Area | Command | Verified result |
| --- | --- | --- |
| Native unit/widget | `cd apps/native && flutter test` | 134 pass |
| iOS simulator integration | `cd apps/native && flutter test integration_test/offline_sync_test.dart -d <simulator-id>` | 1 pass (encrypted loopback HTTP fixture) |
| API modules | `cd apps/api && bun test modules/` | 372 pass, including a wrapper running 7 additional isolated service cases |
| Workspace TypeScript | `bun run typecheck` | 16/16 successful tasks |
| Native analysis | `cd apps/native && flutter analyze --no-pub` | No issues |
| Workspace lint | `bun run lint` | 9/9 successful tasks; non-fatal warnings remain |
| API build | `cd apps/api && bun run build` | Pass |

See [native offline verification](docs/MOBILE/OFFLINE_SYNC_VERIFICATION.md) for the regression inventory, known static-analysis diagnostics, and manual device checklist. API tests use mocked persistence contracts; no live-Postgres or airplane-mode walkthrough is claimed.

- [API unit testing guide](docs/TESTING_UNIT.md)
- [Web E2E testing guide](docs/TESTING_E2E.md) — E2E tests were not run for this native/API change.
- [Flutter engineering/testing standards](docs/BEST_PRACTICE_FLUTTER.md)

Generate ignored Dart outputs after changing Drift tables:

```bash
cd apps/native
dart run build_runner build --delete-conflicting-outputs
flutter test
```
