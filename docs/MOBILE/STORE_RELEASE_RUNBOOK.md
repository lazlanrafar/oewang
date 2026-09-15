# Store release runbook (apps/native)

Everything needed to cut a signed Android/iOS release build, in one place.
Companion to the App Store/Play Store readiness pass (2026-09), updated
after the Sign in with Apple + release-signing pass (2026-09-13).

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

## Build commands

```bash
# Android app bundle (Play Store)
flutter build appbundle --release

# Android APK (sideload / testing)
flutter build apk --release

# iOS (after the manual Xcode signing step below)
flutter build ipa --release
```

**Known local-environment blocker (2026-09-13, not caused by anything in
this pass)**: `flutter build apk --release` currently fails on this
machine with `Failed to find target with hash string 'android-37'`. The
`flutter_secure_storage` plugin requires compiling against Android SDK 37;
the SDK 37 platform package Flutter auto-installs on this machine has
corrupted metadata (`AndroidVersion.ApiLevel=37.0` instead of `37` in
`source.properties`, mis-named install directory) — a broken package from
Google's SDK tooling, unrelated to this repo. Fix by deleting
`~/Library/Android/sdk/platforms/android-37*` and reinstalling SDK
Platform 37 cleanly via Android Studio's SDK Manager (or `sdkmanager
"platforms;android-37"` once the CLI tooling is current), then retry the
build. This blocks verifying the release signing end-to-end for now —
`android/app/build.gradle.kts`'s signing config itself is correct and
was confirmed against the generated keystore via `keytool -list -v`.

## Manual steps (Xcode / store consoles — not automatable from here)

- **Play Console**: Data Safety form, content rating, screenshots, listing
  copy, signing enrollment (Play App Signing, see above).
- **App Store Connect**: create the app record under `com.oewang.app`,
  privacy nutrition label, age rating, App Review notes, TestFlight build
  upload.
- **Apple Developer Portal**: see the Sign in with Apple section above.

## Verification checklist

| Fix | Check | Status |
|---|---|---|
| Android signing | `apksigner verify` on the built bundle/APK shows the release cert, not debug | Blocked by the SDK 37 environment issue above — keystore itself verified valid via `keytool -list -v` |
| Android `POST_NOTIFICATIONS` | Install on API 33+, confirm permission prompt appears, test FCM push | Not yet run |
| iOS entitlement | `codesign -d --entitlements :- <path>` shows `aps-environment` + `com.apple.developer.applesignin` | Needs an Xcode archive build to check |
| Apple Sign-In | End-to-end login against Apple's real Service ID | Needs Phase 2 Apple credentials first |
| Everything else | `flutter analyze` clean, `flutter test` green | ✅ 136 passed, 0 new analyzer issues (2026-09-13) |
