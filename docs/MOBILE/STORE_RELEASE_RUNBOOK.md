# Store release runbook (apps/native)

Everything needed to cut a signed Android/iOS release build, in one place.
Companion to the App Store/Play Store readiness pass (2026-09), updated
after the Sign in with Apple + release-signing pass (2026-09-13), and again
after `.github/workflows/mobile-release.yml` was verified green end-to-end
and the Play Console listing was completed (2026-09-17).

## CI pipeline — verified end-to-end (2026-09-17)

`.github/workflows/mobile-release.yml` (`workflow_dispatch`, `platform:
android|ios|both`) builds, signs, and uploads both platforms from CI —
Android to the Play internal track via fastlane's `android_internal` lane,
iOS to TestFlight via `ios_testflight`. Both jobs have completed clean runs.
Trigger with:

```bash
gh workflow run mobile-release.yml --ref development -f platform=android
gh workflow run mobile-release.yml --ref development -f platform=ios
```

**Always pass `--ref development`** — omitting it defaults to `main`.

Fixes baked into the workflow after real CI failures (not local-only
issues, so don't revert them):
- `sdkmanager` isn't on `ubuntu-latest`'s `PATH` — invoked via
  `$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager`.
- Android SDK 36 (not 37 — see the resolved note below) installed
  explicitly before `flutter pub get`.
- iOS runner pinned to `macos-15` — `macos-14`'s bundled Xcode can't parse
  Swift 6 syntax in freshly-fetched SPM deps (`firebase-ios-sdk`).
- Xcode pinned explicitly to `26.3` via `xcode-select` even on `macos-15`
  — that runner's *default* Xcode (16.4) is too old for `connectivity_plus
  7.3.1`'s `NWPath.isUltraConstrained` usage.
- `FASTLANE_XCODEBUILD_SETTINGS_TIMEOUT`/`_RETRIES` env vars on the
  TestFlight upload step — `xcodebuild -showBuildSettings` can time out
  under CI load during SPM resolution.

## Android signing — done

`android/key.properties` (gitignored) + `~/oewang-release.keystore` (RSA
2048, alias `oewang`, 10000-day validity, PKCS12 — store and key password
are necessarily identical, that's a PKCS12 constraint, not a mistake) were
generated and are in place. **The store/key password was handed to you
once at generation time — back it up to a password manager now if you
haven't.** Losing the keystore file or its password means this app can
never be updated under the same Play Store listing again.

When creating the Play Console listing, enroll in **Play App Signing** —
Google re-signs your upload with its own key, and this keystore becomes the
recoverable "upload key" instead of the sole signing key.

## Sign in with Apple — done (code side)

Added alongside Google as an equivalent login option (App Store guideline
4.8 requires this once any third-party social login is offered):

- `apps/app/app/(api)/api/auth/apple/route.ts` + `.../apple/callback/route.ts`
  — same `state`/`.mobile`/deep-link convention as Google's pair, but Apple's
  callback is a `POST` (`response_mode=form_post`) verified against Apple's
  JWKS, and the client secret is a self-signed ES256 JWT (not a static
  string) — see the callback route's `buildAppleClientSecret`.
- Native: "Continue with Apple" button in `auth_login_screen.dart`, reusing
  the existing `ic-apple.svg` asset and the provider-agnostic
  `loginWithOAuth` method — no native repository changes needed.
- iOS: `ios/Runner/Runner.entitlements` (new) carries both
  `com.apple.developer.applesignin` and `aps-environment`, wired into all
  three build configs via `CODE_SIGN_ENTITLEMENTS` — resolves the
  Xcode-capability step below without opening Xcode.

**Still needed from your Apple Developer account** (I have no access):
create/confirm App ID `com.oewang.app` with Sign In with Apple + Push
Notifications capabilities, create a Services ID + private key (`.p8`) for
Sign in with Apple, and set `APPLE_CLIENT_ID` / `APPLE_TEAM_ID` /
`APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` in Coolify for `apps/app` (documented
in `docs/ENV_VARS.md`).

## iOS bundle ID — done

Unified to `com.oewang.app` (matches Android `applicationId`) across all
Runner + RunnerTests build configs in `project.pbxproj`. **Before archiving**:
create/confirm the matching App ID in Apple Developer Portal under this bundle id.

## Splash screen — done

Generated via `flutter_native_splash` (added as a dev dependency) from the
existing 1024×1024 app icon on a matching solid-black background, for both
platforms. Re-run `dart run flutter_native_splash:create` after any icon
change; `dart run flutter_native_splash:remove` reverts to the Flutter
default if ever needed.

## Version bump

`pubspec.yaml`'s `version: X.Y.Z+N` — `X.Y.Z` is the user-facing version
(`CFBundleShortVersionString` / `versionName`), `N` is the build number
(`CFBundleVersion` / `versionCode`), must increase on every store upload.
Currently `1.0.0+4` (bumped from `+3` after TestFlight rejected a
re-upload of a build number it had already seen).

## Build commands

```bash
# Android app bundle (Play Store)
flutter build appbundle --release

# Android APK (sideload / testing)
flutter build apk --release

# iOS (after the manual Xcode signing step below)
flutter build ipa --release
```

**Resolved (2026-09-15)**: an earlier note here claimed `flutter_secure_storage`
required Android SDK 37 and that a corrupted local SDK 37 install was
blocking release builds. That was wrong — the pinned version
(`flutter_secure_storage: 10.3.1` in `pubspec.yaml`) requires `compileSdk =
36` (see its own `android/build.gradle`), not 37; SDK 37 support only
appears in that package's 11.0.0 major, which isn't in use here. CI
(`.github/workflows/mobile-release.yml`) installs `platforms;android-36`
accordingly — `platforms;android-37` doesn't exist in Google's SDK repo and
its install step failed outright when first tried. `android/app/build.gradle.kts`'s
signing config was confirmed correct against the generated keystore via
`keytool -list -v`.

## Play Console — store listing done, production still gated (2026-09-17)

`com.oewang.app`'s Default store listing is complete: app name, short/full
description, 512×512 app icon, 1024×500 feature graphic, and 4 phone
screenshots (padded to 9:16 from the existing device screenshots in
`docs/MOBILE/UI/`, since Play requires an exact 16:9/9:16 ratio and those
sources are ~590:1278). All 10 App content declarations are actioned
(Advertising ID: **No** — no ad/analytics SDK in `pubspec.yaml`; Data
safety; Content rating; Target audience: 18+; Privacy policy; Ads; Sign-in
details; Financial features; Health apps; Government apps).

**Still blocking "Send app for review" / production access**: Google
requires a closed test with **≥12 opted-in testers running for ≥14 days**
before production access unlocks (Dashboard → Production →
"Apply for access to production"). Internal testing (active, testers
assigned) never goes through Google review — that's separate from this
requirement. This needs real testers and calendar time; it isn't something
a single console pass can push through.

## Manual steps (Xcode / store consoles — not automatable from here)

- **Play Console**: ~~Data Safety form, content rating, screenshots,
  listing copy~~ done (see above) · signing enrollment (Play App Signing,
  see the Android signing section above) · recruit ≥12 closed testers for
  the 14-day production-access requirement.
- **App Store Connect**: create the app record under `com.oewang.app`,
  privacy nutrition label, age rating, App Review notes, TestFlight build
  upload.
- **Apple Developer Portal**: see the Sign in with Apple section above.

## Verification checklist

| Fix | Check | Status |
|---|---|---|
| Android signing | `apksigner verify` on the built bundle/APK shows the release cert, not debug | ✅ confirmed via a clean `mobile-release.yml` (`platform: android`) run — keystore verified valid via `keytool -list -v` |
| Android `POST_NOTIFICATIONS` | Install on API 33+, confirm permission prompt appears, test FCM push | Not yet run |
| iOS entitlement | `codesign -d --entitlements :- <path>` shows `aps-environment` + `com.apple.developer.applesignin` | ✅ implied by a successful signed TestFlight upload via `mobile-release.yml` (`platform: ios`) — no dedicated local archive check done |
| Apple Sign-In | End-to-end login against Apple's real Service ID | Needs Phase 2 Apple credentials first |
| Everything else | `flutter analyze` clean, `flutter test` green | ✅ 136 passed, 0 new analyzer issues (2026-09-17) |
