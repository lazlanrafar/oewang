# oewang mobile

The Flutter app for iOS and Android, on the new API over OWE1 (D113). The spec is [docs/features/mobile.md](../../docs/features/mobile.md).

```bash
fvm install                       # the version in .fvmrc
fvm flutter pub get
fvm flutter analyze
fvm flutter test
fvm flutter run --dart-define-from-file=env/dev.json   # against the local stack
```
