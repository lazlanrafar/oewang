---
name: flutter-developer
description: >-
  Flutter 3.x mobile and POS application engineering skill. Enforces MVVM + Repository pattern
  (abstract interface + remote API + fake for tests), Riverpod dependency injection, @freezed
  immutable models, Command<I,O> & Result<T> error handling, go_router navigation, and shared
  flutter_ui Atomic Design components. Use when building, reviewing, or debugging Flutter/Dart apps.
---

# Flutter Developer Skill

Engineering guidelines for production Flutter applications (`apps/pos`, `apps/customer`, `apps/member`) using **MVVM + Repository + Riverpod + Freezed + `go_router`**.

---

## 1. Architecture: MVVM + Repository Pattern

Keep a strict separation between UI widgets, state orchestration, and network/storage I/O:

```text
lib/
  components/
    atoms/                  # Re-exports or app-specific primitives built on packages/flutter-ui
    molecules/              # Composite controls (search bars, point cards, keypad)
    organisms/              # Feature sections
  features/
    <feature>/
      data/
        <feature>_repository.dart         # Abstract interface
        remote_<feature>_repository.dart  # Uses shared ApiClient
        fake_<feature>_repository.dart    # Deterministic in-memory fake for widget/unit tests
      domain/
        <feature>_model.dart              # @freezed immutable data classes
      presentation/
        <feature>_view_model.dart         # Riverpod Notifier / AsyncNotifier + Command<I,O>
        <feature>_screen.dart             # Pure declarative UI observing ViewModel state
```

1. **Views Are Dumb**: Widgets render state and dispatch user intents via ViewModel methods or `Command` objects. Widgets never call `ApiClient` or parse raw JSON.
2. **Repositories Abstract Data Sources**: Every repository defines an `abstract class` with both a `Remote*Repository` (production) and a `Fake*Repository` (fast, deterministic unit/widget tests without flaky network mocks).
3. **Explicit `Result<T>` & `Command<I, O>`**:
   - Return `Result<T>` (`Ok<T>` / `Error<T>`) from repositories rather than throwing unhandled exceptions across async boundaries.
   - Wrap user-triggered mutations (login, checkout, redeem points) in `Command<I, O>` so running/error/completed states are tracked automatically and double-taps are prevented.

---

## 2. Data Models, IDs & Code Generation (`freezed`)

- **Immutable Models with `@freezed`**: Use `freezed` and `json_serializable` for all domain models and API payloads.
- **String IDs Everywhere**: CUID2 primary/foreign keys from the API are always typed as `String` — never `int.parse()` an entity ID.
- **Money & Points Formatting**: Never use `double` arithmetic for currency totals; use integer minor units or exact decimal representations formatted via `Intl`.
- Run codegen after modifying models:
  ```bash
  flutter pub get && dart run build_runner build --delete-conflicting-outputs
  ```
  *(Generated `*.freezed.dart` and `*.g.dart` files remain git-ignored where configured).*

---

## 3. Shared Design System (`packages/flutter-ui` & `DESIGN.md`)

1. **Read `DESIGN.md` Before Touching UI**: Every app has a `DESIGN.md` paired with `packages/flutter-ui` (`theme.dart`, color tokens, typography scale, spacing, radii).
2. **Atomic Design Reuse**:
   - Import shared primitives (`atoms`) from `flutter_ui`.
   - Never hardcode hex colors (`Color(0xFF...)`), arbitrary font sizes, or custom button styles inside feature screens; consume theme tokens (`Theme.of(context)` / `AppTheme`).
   - Any change to shared tokens or atom variants in `packages/flutter-ui` must update the corresponding `DESIGN.md` in the same commit.

---

## 4. Navigation, Performance & Quality Gates

- **Declarative Routing (`go_router`)**: Centralize route definitions, auth redirect guards, and deep-link parsing in the router configuration. Never push anonymous `MaterialPageRoute` ad-hoc from feature widgets.
- **`const` Constructors & Rebuild Scope**: Mark stateless widgets and static subtrees `const`, and scope `ref.watch(...)` using `.select(...)` to minimize widget rebuilds.
- **Mandatory Quality Gates**:
  ```bash
  flutter analyze --fatal-infos
  flutter test
  ```
