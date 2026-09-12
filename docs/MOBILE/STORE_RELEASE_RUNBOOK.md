# Store release runbook (apps/native)

Everything needed to cut a signed Android/iOS release build, in one place.
Companion to the App Store/Play Store readiness pass (2026-09).

## Android signing (one-time setup)

`android/key.properties` is gitignored and read by `android/app/build.gradle.kts`.
Without it, release builds fall back to the debug cert (fine for local
`flutter run --release`, not for a Play Store upload).

1. Generate a keystore (ask before running — this mints a credential):
   ```
   keytool -genkey -v -keystore ~/oewang-release.keystore \
     -alias oewang -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Create `apps/native/android/key.properties`:
   ```
   storePassword=<password>
   keyPassword=<password>
   keyAlias=oewang
   storeFile=/absolute/path/to/oewang-release.keystore
   ```
3. Store the keystore file and password somewhere durable outside the repo
   (password manager). Losing it means you can never update the app under
   the same Play Store listing again.
4. In Play Console, enroll in Play App Signing when creating the listing —
   Google then re-signs your upload with its own key, and your keystore
   becomes the "upload key" (recoverable if lost, unlike the signing key).

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

## Manual steps (Xcode / store consoles — not automatable from here)

- **Push Notifications capability**: open `ios/Runner.xcworkspace` → `Runner`
  target → Signing & Capabilities → "+ Capability" → Push Notifications.
  Xcode generates `Runner.entitlements` and wires it into all three build
  configs.
- **Bundle ID**: confirm the production bundle id in App Store Connect
  matches what's archived (currently `com.oewang.oewang.sandbox` across all
  configs — no separate prod id exists yet; decide this before archiving).
- **Play Console**: Data Safety form, content rating, screenshots, listing
  copy, signing enrollment.
- **App Store Connect**: privacy nutrition label, age rating, App Review
  notes, TestFlight build upload.

## Verification checklist

| Fix | Check |
|---|---|
| Android signing | `apksigner verify` on the built bundle/APK shows the release cert, not debug |
| Android `POST_NOTIFICATIONS` | Install on API 33+, confirm permission prompt appears, test FCM push |
| iOS entitlement | `codesign -d --entitlements :- <path>` shows `aps-environment` |
| Everything else | `flutter analyze lib test` clean, `flutter test` green (134+) |
