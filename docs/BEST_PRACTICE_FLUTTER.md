# Flutter Best Practices

> See also: [CLAUDE.md](../CLAUDE.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md) · [BEST_PRACTICE_ELYSIA.md](./BEST_PRACTICE_ELYSIA.md) · [BEST_PRACTICE_NEXT_JS.md](./BEST_PRACTICE_NEXT_JS.md) · [MOBILE/IMPLEMENTATION_PLAN.md](./MOBILE/IMPLEMENTATION_PLAN.md)
>
> **Upstream references** — Flutter [App Architecture Recommendations](https://docs.flutter.dev/app-architecture/recommendations) (the official MVVM + Repository + Command guide) and Miquido's [Flutter App Best Practices](https://www.miquido.com/blog/flutter-app-best-practices/).

This document captures **oewang-specific** Flutter patterns for `apps/native`. These are enforced rules, not suggestions. Everything here exists because either the Flutter team strongly recommends it or it keeps the mobile app architecturally coherent with `apps/app` (Next.js) and `apps/api` (ElysiaJS).

---

## TL;DR — the seven non-negotiables

1. **MVVM** — every screen is a `View` widget + a `ViewModel` class. Widgets are dumb.
2. **Repository pattern** — every external system is reached only through an **abstract** repository. Concrete classes live in `data/repositories_remote/` (real) or `data/repositories_fake/` (tests).
3. **Unidirectional flow** — events go View → ViewModel → Repository; data flows back the other way. Never the reverse, never sideways.
4. **Immutable models** — every domain type is `@freezed`. No mutable state outside ViewModels.
5. **DI via Riverpod** — no globals, no service locators, no `BuildContext` business-logic lookups.
6. **Commands for actions** — every async UI action goes through `Command<I, O>` so disable/spinner/error are consistent.
7. **Fakes for tests** — every abstract repository ships a fake next to its remote implementation.

---

## Architecture

### The three layers

```
components/     ← Views (widgets) + ViewModels, Atomic Design layout — Flutter SDK only
domain/         ← Immutable models, value objects, mappers — pure Dart
data/           ← Repositories (abstract + concrete) + Services — owns Dio, storage
```

### Atomic Design — `lib/components/`

The UI layer is `lib/components/`, organized by [Atomic Design](https://atomicdesign.bradfrost.com/):

```
components/
  atoms/        ← smallest reusable widgets (button, money_text, section_label)
    inputs/     ← the one Input system: input.dart (dispatch), contexts/ (one self-contained
                  file per context: render + opener + sheet), bases/ (shared drawer host/row/
                  header/metrics), input_styles/ decorators/ validators/ extensions/
  molecules/    ← compositions of atoms (page_app_bar, segmented_tabs, list_row)
  organisms/    ← feature-complete UI, ALWAYS grouped by module folder + {module}_ filename prefix
    {module}/   ← auth, categories, settings, stats, transactions, wallets
                  screens AND their view-models live flat here (no widgets/ or view_models/ subfolder)
                  e.g. organisms/transactions/transactions_form_screen.dart
                       organisms/transactions/transactions_form_view_model.dart
    settings/   ← large modules may sub-group by area: settings/currency/, settings/workspace/, …
  layouts/      ← app shell scaffolding (main_shell, bottom_nav, fab, smoke_screen)
```

Rules:

- **Organism filenames always start with `{module}_`** (the folder name), collapsing redundancy — `category_list_screen.dart` → `categories/categories_list_screen.dart`. View-models sit beside their screen, flat in the module folder.
- **No `oewang_` brand prefix** on atom/molecule/layout filenames — the package is already `oewang`.
- Promote a widget down the tree (organism → molecule → atom) the moment a second page needs it. Reusable rows/labels like `ListRow` (molecule) and `SectionLabel` (atom) came out of `settings_screen.dart` this way.

### Layer rules — what may import what

| Layer | May import | MUST NOT import |
| ----- | ---------- | --------------- |
| `components/` widgets (atoms/molecules/organisms/layouts) | sibling components, `domain/models/`, `core/`, view-models in the same module | `data/**`, `dio`, `http`, `json_*` |
| `components/organisms/{module}/*_view_model.dart` | `data/repositories/` (abstract only), `domain/models/`, `core/command/` | `data/repositories_remote/`, `data/services/`, widgets |
| `data/repositories/` (abstract) | `domain/models/`, `core/result/` | widgets, `dio`, services |
| `data/repositories_remote/`     | abstract repo, `data/services/`, `data/dto/`, `domain/mappers/` | widgets, view-models |
| `data/services/`                | `dio`, `flutter_secure_storage`, platform channels | repos, view-models, widgets |
| `domain/`        | nothing in `data/` or `components/` | `dio`, `flutter/material` |

Enforce with a CI grep against `import` lines per directory. A `dart_code_metrics` ruleset or `import_lint` package is acceptable too.

### MVVM in 80 lines

```dart
// domain/models/transaction.dart
@freezed
class Transaction with _$Transaction {
  const factory Transaction({
    required String id,
    required TransactionType type,
    required Money amount,
    required DateTime occurredAt,
    required String walletId,
    String? categoryId,
    String? note,
  }) = _Transaction;
}

// data/repositories/transactions_repository.dart
abstract class TransactionsRepository {
  Future<Result<List<Transaction>, AppError>> list({
    required DateTime from,
    required DateTime to,
  });
  Future<Result<Transaction, AppError>> create(NewTransactionDraft draft);
}

// data/repositories_remote/transactions_repository_remote.dart
class TransactionsRepositoryRemote implements TransactionsRepository {
  TransactionsRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<List<Transaction>, AppError>> list({...}) async {
    try {
      final res = await _api.get('/transactions', queryParameters: {...});
      final dtos = (res.data['data'] as List).map(TransactionDto.fromJson);
      return Ok(dtos.map(toDomain).toList());
    } on DioException catch (e) {
      return Err(AppError.fromDio(e));
    }
  }
  // …
}

// components/organisms/transactions/transactions_daily_view_model.dart
class TransactionsDailyViewModel extends ChangeNotifier {
  TransactionsDailyViewModel(this._repo);
  final TransactionsRepository _repo;          // abstract — never the remote class

  List<Transaction> items = const [];
  bool loading = false;
  AppError? error;

  Future<void> load(DateTime month) async {
    loading = true; error = null; notifyListeners();
    final res = await _repo.list(from: month.startOfMonth, to: month.endOfMonth);
    res.fold((ok) => items = ok, (e) => error = e);
    loading = false; notifyListeners();
  }
}

// components/organisms/transactions/transactions_daily_screen.dart
class TransactionsDailyScreen extends ConsumerWidget {
  const TransactionsDailyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final vm = ref.watch(transactionsDailyVmProvider);
    if (vm.loading) return const _DailyShimmer();
    if (vm.error != null) return ErrorState(error: vm.error!);
    return _DailyList(items: vm.items);  // dumb widget — no business logic
  }
}
```

**This is the pattern.** Every feature copies it.

---

## State Management — Riverpod

We use **Riverpod** because Flutter's docs explicitly call out compile-time-safe DI and the team already thinks in TanStack Query terms.

### Rules

1. **One provider per ViewModel.** Name: `<feature><Screen>VmProvider`.
2. **Repositories are providers too.** `transactionsRepositoryProvider` returns the abstract type — override it in tests with the fake.
3. **Never `read` in `build`.** Use `ref.watch` for reactive data; reserve `ref.read` for one-shot event handlers (button taps).
4. **Lift state only as high as it's consumed.** Per-screen view models stay in `ScopedProvider`; cross-screen state (auth session, active wallet) goes in `Provider` at app root.
5. **No `setState` in screens that have a ViewModel.** Local widget state for animations is fine.

```dart
// ✅ CORRECT — one provider, abstract repo, fake-friendly
final transactionsDailyVmProvider =
    ChangeNotifierProvider.autoDispose<TransactionsDailyViewModel>(
  (ref) => TransactionsDailyViewModel(ref.watch(transactionsRepositoryProvider)),
);

final transactionsRepositoryProvider = Provider<TransactionsRepository>(
  (ref) => TransactionsRepositoryRemote(ref.watch(apiClientProvider)),
);

// ❌ FORBIDDEN — view model depending on a concrete class
class _Vm extends ChangeNotifier {
  final TransactionsRepositoryRemote _repo;  // concrete — un-fakeable
}
```

---

## Widgets

### `const` everywhere it compiles

```dart
// ✅ Cheap. Skipped on rebuild.
const SizedBox(height: 16)

// ❌ Re-allocates every build.
SizedBox(height: 16)
```

The `analysis_options.yaml` ships with `prefer_const_constructors` and `prefer_const_constructors_in_immutables` lint as **errors**.

### `StatelessWidget` by default

Reach for `StatefulWidget` only when you need a `TickerProvider`, an `AnimationController`, a `TextEditingController` whose lifecycle you own, or `setState` for local UI-only state (e.g., a toggle inside an animation).

Anything that touches data goes through a ViewModel — never `setState` calling a repository.

### Composition over giant `build` methods

> Flutter docs / Miquido: "Break down complex widgets into smaller, reusable widgets."

- Hard cap: 150 lines per `build` method. Past that, extract.
- **Extract widget classes**, not "build helper" methods. Helper methods that return widgets defeat `const` and break `Widget`-level rebuild boundaries.

```dart
// ✅ CORRECT — separate widget; const-able; rebuilds in isolation
class _DailyList extends StatelessWidget {
  const _DailyList({required this.items});
  final List<Transaction> items;
  @override
  Widget build(BuildContext context) => ListView.builder(...);
}

// ❌ FORBIDDEN — helper method; forces the parent to rebuild the whole subtree
Widget _buildDailyList(List<Transaction> items) => ListView.builder(...);
```

### Lazy lists

Use `ListView.builder` / `GridView.builder` / `SliverList.builder`. **Never** `ListView(children: [...])` for more than ~10 fixed items.

### Keys

Use `ValueKey(item.id)` on list rows that can reorder (the reorderable category list, IMG_1846/47). For everything else, let Flutter handle it.

### Layout primitives we prefer

- **Spacing** via `SizedBox`, not `Padding(padding: EdgeInsets.only(top: 8))` for single-axis gaps.
- **Conditional rendering** via early `return` or `if` inside a list — avoid `Visibility` unless we genuinely need to keep the subtree alive.
- **Rounded corners + tinted backgrounds** go through `Card` (`color: OewangColors.card`) so we get consistent radius from `OewangRadius`.

---

## Performance

> Flutter docs / Miquido: "Keep the build method lightweight."

- No `await`s, parsing, or layout math in `build`. Compute upstream.
- Heavy work (CSV export, full-month aggregation) → `compute()` / `Isolate.run()`.
- Cache derived calendar / chart data in the ViewModel; don't recompute every rebuild.
- Profile with **Flutter DevTools** (Frame chart + Performance overlay) before adding `RepaintBoundary` — never speculative.
- Images: `cached_network_image` + explicit `width`/`height` so the layout pass is cheap.
- `ListView.builder` everywhere lists scroll.

---

## Naming

| Context                       | Convention             | Example                                 |
| ----------------------------- | ---------------------- | --------------------------------------- |
| Files & folders               | `snake_case`           | `transactions_daily_screen.dart`        |
| Classes (widgets, types)      | `UpperCamelCase`       | `TransactionsDailyViewModel`            |
| Methods, fields, params       | `lowerCamelCase`       | `loadFor(month)`                        |
| Constants (`const` globals)   | `lowerCamelCase`       | `defaultPageSize`                       |
| Enums                         | `UpperCamelCase` + `lowerCamelCase` cases | `TransactionType.income` |
| Riverpod providers            | `lowerCamelCase` + `Provider` suffix | `transactionsDailyVmProvider` |
| Private members               | `_` prefix             | `_repo`, `_DailyList`                   |

> The wider monorepo uses `snake_case` for DB/API field names and `camelCase` for React props. Inside Flutter, **always** `lowerCamelCase` — DTOs translate JSON `snake_case` into `camelCase` at the `freezed` boundary.

---

## Networking — `data/services/api/`

`ApiClient` is the **only** thing in `apps/native` that imports `dio`. Mirrors `packages/modules/src/lib/axios.server.ts`.

```dart
class ApiClient {
  ApiClient(this._dio);
  final Dio _dio;

  static ApiClient build(EnvConfig env, SecureStorageService storage) {
    final dio = Dio(BaseOptions(
      baseUrl: '${env.apiUrl}/v1',
      contentType: 'application/json',
    ));
    dio.interceptors.addAll([
      AuthInterceptor(storage),               // injects Bearer oewang-session
      EncryptionInterceptor(env.encryptionKey), // AES-256-GCM, x-encrypted: true
      ErrorMappingInterceptor(),              // DioException → AppError
    ]);
    return ApiClient(dio);
  }

  Future<Response<T>> get<T>(String path, {Map<String, dynamic>? queryParameters}) =>
      _dio.get(path, queryParameters: queryParameters);
  // …
}
```

### Rules

1. **One `ApiClient`** — built once at startup, injected via `apiClientProvider`.
2. **No `dio` imports outside `data/services/api/`** — checked in CI.
3. **Encryption parity** — the AES-256-GCM cipher MUST be wire-compatible with `packages/encryption`. Cross-check with a known plaintext on both sides before shipping.
4. **No raw `fetch`/`http` package** — only `Dio` via `ApiClient`.
5. **Repositories own `try/catch`** — `ApiClient` doesn't swallow errors; repositories wrap calls and convert to `Result<T, AppError>`.

---

## Auth & Secure Storage

- JWT cookie name is `oewang-session` (matches web).
- Stored via `flutter_secure_storage` (Keychain on iOS, Keystore on Android).
- `AuthInterceptor` reads it on every request.
- On `401`, the interceptor clears storage and routes to `/login` via `go_router`'s redirect.
- **NEVER** log the token, the encryption key, or decrypted payloads. Same rule as the web app.

---

## Theming — single source of truth

All colors and radii come from `core/theme/`, which mirrors `packages/ui/src/globals.css` (the dark `.dark` block) and `packages/ui/src/lib/fonts/registry.ts`.

```dart
// ✅ CORRECT
Container(color: OewangColors.card, child: ...)
Text('Rp 1.952.500,00', style: OewangFonts.currency(fontSize: 14))

// ❌ FORBIDDEN
Container(color: const Color(0xFF121212), child: ...)        // hardcoded
Text('Rp 1.952.500,00', style: TextStyle(fontFamily: 'Hedvig')) // bypasses tokens
```

Rules:

- **No hardcoded `Color(...)`** outside `core/theme/`. CI grep flags it.
- **No `TextStyle(fontFamily: ...)`** anywhere. Use `OewangFonts.sans / .currency / .mono`.
- **Currency text always uses `MoneyText`** (Hedvig Serif + `FontFeature.tabularFigures()` + locale-aware formatter). This matches commit `cad4a22` on the web.
- Light theme will land later; for now `ThemeMode.dark` is forced.

---

## Routing — `go_router`

- One `GoRouter` lives in `core/router/app_router.dart`.
- The four bottom-nav tabs are a `StatefulShellRoute.indexedStack` so each tab keeps its own navigation history.
- Auth-gated routes use a `redirect:` callback that reads `authStateProvider`.
- **Never** push routes via `Navigator.push` in app code — always `context.go(...)` / `context.push(...)`.
- Deep links land at the right tab via `path` matching, not custom logic.

---

## Forms

The Transaction Form (IMG_1830–32) and the Account Form (IMG_1836) are the canonical examples. Both are assembled entirely from the reusable field + input-panel system — **everything input-related lives under `lib/components/atoms/inputs/`** (the `Input` widget, its styles/decorators/validators, `FormFieldRow`, the `FormDrawerHost` infra, and the keypad/calendar/picker sheets). Do not hand-roll new row/sheet widgets for a form; compose these.

### ViewModel rules

1. The ViewModel owns one immutable `FormState` value with `copyWith` — never per-field setters scattered through the widget. Fields update via small `setX(value)` methods that `copyWith` + `notifyListeners`.
2. Validation is a pure getter on `FormState` (`isValid`); the Save button binds to it via `canSave` and a `Command`.
3. `Command<NewTransactionDraft, Transaction>` drives the Save button's disabled / spinner / error states. **No manual `isLoading` booleans on buttons.**
4. Plain `TextField`s with `onChanged` feed the ViewModel directly; the form has no `TextEditingController`s for these simple fields.

### The one input component — `Input` (`atoms/inputs/input.dart`)

**There is no other input/field/select widget** — `SelectField`, `SelectDateField`, `SelectEntityField` and `AmountInputField` were merged into `Input` and deleted. Pick a `variant` for the look and a `context` for the behaviour:

| `context`  | Behaviour                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| `text`     | Typed [TextField]. `variant`: `underline` (default — in-app forms), `outlined` (boxed login), `filled` (grey box), `none` (no border/fill). `label`/`hintText`/`obscureText`/`keyboardType`/`autofillHints`/`onChanged`/`onSubmitted`. |
| `accounts` | Like `text` but required + whitespace-tidied (account names).                                               |
| `currency` | Labelled row → **keypad drawer**, live `Rp 1.000.000`. `amount`/`onAmountChanged`, `currency`, `showCurrencyTabs`, `useCurrencyCode`, `valueColor`, `trailing`. |
| `date`     | Labelled row → **calendar drawer**. `date`/`onDateChanged`, `datePattern`, `firstDate`/`lastDate`.          |
| `select`   | Labelled row → **entity picker drawer** via `entity: EntitySelect<T>(...)` (`gridColumns` → grid with optional `leadingOf` emoji, else list); or a plain tappable row via `displayValue` + `onTap`. |

Row-layout opt-ins shared by `currency`/`date`/`select`: `labelPosition` (`left` = two-column row with the label on the left, default; `top` = label stacked above the field) — in **both** layouts the value/input area renders the `variant` border (so use `variant: none` for the plain WMoney row; the border turns foreground while that field's drawer is open), `labelWidth`, `height` (uniform row height), `showBorder` (own bottom border instead of a `Divider`), `drawerId`, `placeholder`. They report changes through callbacks and never mutate the ViewModel themselves.

Folder structure under `atoms/inputs/`: `input.dart` (the widget) just **dispatches** by context — each context is **self-contained** in `contexts/`, holding its render code, its `open…Drawer` opener, and its sheet(s): `input_context_currency.dart` (keypad + `openAmountDrawer`), `input_context_date.dart` (calendar + `openDateDrawer`), `input_context_select.dart` (`EntitySelect<T>` + grid/list pickers + `openGridDrawer`/`openListDrawer`), `input_context_text.dart`, and the shared `input_context_row.dart`. The stateful contexts (text/currency) receive their mutable state from `_InputState`. Shared building blocks live in `bases/`: `input_base_drawer_host.dart` (`FormDrawerHost`/`Scope`/`Controller`), `input_base_field_row.dart` (`FormFieldRow`), `input_base_drawer_header.dart`, `input_base_drawer_metrics.dart`. Plus `input_variant.dart`, `input_context.dart`, `input_label_position.dart`, `input_style.dart` (contract + `InputStyleResolver`, typed contexts only), `input_styles/` (one `InputStyle` per typed context), `decorators/`, `validators/`, `extensions/input_decoration_extension.dart`. Add a context → add a self-contained `contexts/` file + a dispatch arm; promote anything reused by 2+ contexts into `bases/`.

`FormFieldRow` (`atoms/inputs/bases/input_base_field_row.dart`) is the base labelled row (fixed-width label + child) that `Input`'s drawer contexts build on; use it directly only for a bare text editor inside a form row (its chrome supplies the label/border, so don't wrap a bordered `Input` in it). Opt-ins: `height`, `showBorder`, `focusNode`, `onTap`.

`Button` (`atoms/button.dart`) — `variant`: `primary` (default, filled), `outlined` (bordered, e.g. social buttons), `danger` (coral), `ghost` (transparent). Optional `leading` glyph; built-in `loading` spinner; full-width with square corners.

### In-form input panels (`FormDrawerHost`)

Pickers render as a **non-modal split panel** pinned to the bottom — a flat, square, full-width "second screen", not a floating modal. The form above stays fully visible and interactive.

1. Wrap a form body in `FormDrawerHost(child: …)`. It supplies a `FormDrawerController` via `FormDrawerScope` and renders the bottom panel.
2. Fields call the `openAmountDrawer` / `openGridDrawer` / `openListDrawer` / `openDateDrawer` helpers. When a host is an ancestor they open in the shared panel; with no host they **fall back to a modal bottom sheet** — so the fields work anywhere.
3. Tapping a different field **swaps** the panel content (e.g. Amount → Category) instead of stacking sheets, because the form behind is never blocked. Tapping a text field closes the panel via `FormDrawerScope.maybeOf(context)?.close()`.
4. Every panel is the same fixed height (`DrawerMetrics.height`) with the same black header (`FormDrawerHeader`). All panel sizing/colors live in `components/atoms/inputs/bases/input_base_drawer_metrics.dart` — change them in one place.
5. Sheet contents are Navigator-free widgets (`AmountKeypad`, `GridPickerContent`, `EntityListContent`, `CalendarContent`) wired with `onSelected`/`onChanged`/`onClose`; the modal `*Sheet.show()` wrappers and the host both reuse them.

### Money formatting

- **Display while typing:** `AmountFormat` (`lib/core/format/amount_format.dart`) — locale-aware thousands grouping with decimals only when entered (`Rp 1.000.000`). Use this for live input fields.
- **Final/stored display:** `Money.format()` — fixed 2-decimal currency (`Rp 1.000.000,00`). Use this for lists and read-only amounts.
- Both honor the `id_ID` locale and the `IDR`/`USD`/`SGD` symbols. A `decimals` param on `AmountFormat` lets the workspace "Decimal point" setting drive precision later.

### Grouped list cards

The Daily transactions list (`transactions_daily_screen.dart`) groups by day: each day group (header + rows) paints a white `background` card, separated by gaps that reveal a faint `border`-tinted backdrop behind the `CustomScrollView`. Keep group cards opaque and let the backdrop show through the inter-group `SizedBox` gaps.

The same pattern drives grouped settings/menu lists. The shared pieces are `SectionLabel` (`components/atoms/section_label.dart`) — a section header whose leading transparent gap lets the backdrop show through — and `ListRow` (`components/molecules/list_row.dart`) — a tappable icon + title/subtitle/trailing row painting a `background` card. Put a `ColoredBox(color: border.withValues(alpha: 0.5))` behind the `ListView` and compose these; don't re-roll row/label widgets per screen.

### CRUD setting lists (swipe-to-delete + edit)

Editable catalog lists (Categories, Account Group, Accounts) share `SwipeActionRow` (`components/molecules/swipe_action_row.dart`): a red minus toggle slides the row left to reveal a Delete action, plus an edit button and an **optional** drag handle. Pass `dragIndex: i` (inside a `ReorderableListView.builder`) for reorderable lists; omit it for plain CRUD lists. Tapping the row body while open cancels the reveal. Use `leading:` for an emoji/icon. Don't re-roll the swipe/reveal Stack per screen — extend `SwipeActionRow`. Mutations go through the repo then bump a revision `NotifierProvider` to refetch.

---

## Internationalization

- ARB files in `lib/l10n/`. Codegen via `flutter gen-l10n`.
- Initial locales: `en`, `id` (matches the IDR-first screenshots).
- **No hardcoded user-facing strings.** Same rule as the web app's dictionary system.
- Number/date formatting through `intl`'s `NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 2)` and `DateFormat.yMMM('id_ID')`.

---

## Accessibility

- Every tappable area ≥ 44×44 logical pixels.
- All icons used as buttons wrap a `Semantics(label: ...)` or live inside an `IconButton(tooltip: ...)`.
- Color is never the sole carrier of meaning (income/expense rows carry a `+`/`−` sign in addition to color).
- Respect the system text scale up to 1.3× without layout breakage; goldens cover 1.0× and 1.3×.

---

## Dependencies — keep the list small

> Miquido: "Prioritize packages that are actively supported and maintained… Reserve packages for must-have functionality."

Approved baseline (pinned in `pubspec.yaml`):

`flutter_riverpod`, `riverpod_annotation`, `dio`, `dio_cookie_manager`, `flutter_secure_storage`, `freezed_annotation`, `json_annotation`, `google_fonts`, `intl`, `fl_chart`, `table_calendar`, `go_router`, `pointycastle`, `flutter_dotenv`, `cached_network_image`, `image_picker`.

Dev: `build_runner`, `freezed`, `json_serializable`, `riverpod_generator`, `mocktail` (only when fakes are heavier than mocks), `flutter_lints`, `very_good_analysis`.

**Any new dependency PR requires:** (1) last release within 12 months, (2) > 70 pub points or a clear justification, (3) one-paragraph note in the PR describing why a custom implementation isn't better.

---

## Testing

| Layer        | Tool                  | Required |
| ------------ | --------------------- | -------- |
| Services     | `flutter test` (unit) | yes      |
| Repositories | unit (remote + fake)  | yes      |
| Mappers      | unit                  | yes      |
| ViewModels   | unit (with fake repo) | yes      |
| Views        | widget + golden       | for every screen in `MOBILE/UI/` |
| Flows        | `integration_test`    | login, add transaction, edit transaction |

Rules:

- **Fakes over mocks.** Mockito/`mocktail` only when fakes are heavier than mocks.
- **Provider override per test.** `ProviderScope(overrides: [transactionsRepositoryProvider.overrideWithValue(fake)])`.
- **Goldens regenerate on macOS only** to avoid font-rendering churn. CI compares; doesn't generate.
- **Coverage floor: 70%** on `domain/`, `data/repositories_remote/`, and the `*_view_model.dart` files under `components/organisms/`. UI golden coverage is binary (matches / doesn't).

---

## Logging

- One logger in `core/logging/app_logger.dart`, a thin wrapper over `dart:developer` (no extra dependency). `createLogger("module")` mirrors the API's logger so logging reads the same across apps:
  ```dart
  final _log = createLogger('auth');
  _log.warn('401 — clearing session', {'path': path});
  _log.error('upload failed', error: e, stackTrace: st);
  ```
- Key/value `fields` are JSON-encoded for grep-parity with the API. Levels: `debug` / `info` / `warn` / `error`.
- **NEVER** log secrets (JWT, encryption key, decrypted payloads). Same rule as the API — e.g. `mapDioError` logs method/path/status, never the response body.
- In release builds `debug`/`info` are dropped; only `warn`/`error` escalate. Hook a remote sink (Sentry) into `AppLogger._emit` when crash reporting ships.

---

## CI / lints

`analysis_options.yaml` extends `very_good_analysis`. The following are **errors**, not warnings:

- `prefer_const_constructors`
- `prefer_const_constructors_in_immutables`
- `unawaited_futures`
- `avoid_print`
- `always_declare_return_types`
- `require_trailing_commas`
- `use_build_context_synchronously`

CI also runs:

- `dart format --output=none --set-exit-if-changed .`
- `flutter analyze --fatal-infos`
- `flutter test --coverage`
- A custom grep step asserting layer-import rules (§Architecture).

---

## Anti-patterns we reject

| ❌ Don't                                            | ✅ Do                                                        |
| --------------------------------------------------- | ------------------------------------------------------------ |
| `ListView(children: [for (final x in items) ...])`  | `ListView.builder(itemCount: items.length, itemBuilder: ...)` |
| `setState(() => isLoading = true)` then HTTP        | Move the call into a ViewModel `Command`                     |
| `Provider.of<X>(context)` for business logic        | `ref.watch(xProvider)` inside the ViewModel/screen           |
| `static final api = Dio()` global                   | DI through `apiClientProvider`                               |
| `Color(0xFF...)` inline                             | `OewangColors.<token>`                                       |
| `TextStyle(fontFamily: 'Hedvig…')`                  | `OewangFonts.sans(...)` / `MoneyText`                        |
| Helper methods returning widgets                    | Extract a `StatelessWidget` subclass                         |
| Logic inside `Widget build`                         | Move to ViewModel; views just render                         |
| Repository throwing `DioException`                  | Return `Result<T, AppError>`                                 |
| `dynamic` in domain models                          | `freezed` + typed fields                                     |
| `print(...)`                                        | `logger.info(...)`                                           |

---

## Quick reference

- **New screen?** Create `components/organisms/<module>/<module>_<name>_screen.dart` + `components/organisms/<module>/<module>_<name>_view_model.dart` (flat in the module folder) + a `*VmProvider`. Shared widgets go in `atoms/` or `molecules/`, not the module folder.
- **Add + edit the same record?** Use ONE `<module>_form_screen.dart` (not separate `*_new_screen` / `*_edit_screen`). Take a nullable record arg: `null` ⇒ create, non-null ⇒ edit. The screen branches title/labels and create-vs-update on that. One widget, one provider, less drift. (e.g. `categories_form_screen.dart`, `transactions_form_screen.dart`, `wallets_account_form_screen.dart`.)
- **New external call?** Add the method to the abstract repository in `data/repositories/`. Implement in `data/repositories_remote/`. Add fixtures to `data/repositories_fake/`.
- **New domain type?** `@freezed` in `domain/models/`. Mapper in `domain/mappers/`.
- **New design token?** Add to `core/theme/` only. Never inline.
- **Need an action button?** Wrap in `Command<I, O>`; bind disabled/spinner/error to its state.

If you can't answer "which layer owns this and which one consumes it?" before writing the code, stop and re-read this doc.
