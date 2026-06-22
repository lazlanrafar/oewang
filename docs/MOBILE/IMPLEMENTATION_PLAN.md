# Oewang Mobile — Flutter Implementation Plan

> **Scope** — Build `apps/native`, a Flutter mobile app that mirrors the layout of the iOS reference screenshots in `docs/MOBILE/UI/` while reusing the **Oewang design tokens** (colors, fonts) already shipped in `packages/ui/src/globals.css` and `packages/ui/src/lib/fonts/registry.ts`.
>
> **Layout source of truth** — the iOS screenshots in `docs/MOBILE/UI/`.
> **Look-and-feel source of truth** — the existing Oewang web app dark theme + Hedvig Letters / Geist Mono fonts.
> **Engineering source of truth** — [BEST_PRACTICE_FLUTTER.md](./BEST_PRACTICE_FLUTTER.md), itself based on Flutter's official [App Architecture Recommendations](https://docs.flutter.dev/app-architecture/recommendations) (MVVM + Repository + Command, unidirectional data flow, immutable models, DI, repository fakes for tests).

---

## 1. Information Architecture (from screenshots)

The reference is a personal-finance app with a four-tab bottom navigation bar:

| Tab          | Active label / icon  | Primary screen                                 |
| ------------ | -------------------- | ---------------------------------------------- |
| **Trans.**   | "05/01" (today) icon | Transactions (Daily / Calendar / Monthly / Summary sub-tabs) |
| **Stats**    | bar-chart icon       | Stats (Stats / Budget / Note sub-tabs) — interactive pie + category list / monthly budget summary / notes breakdown |
| **Accounts** | stacked-coins icon   | Accounts list grouped by Cash / Accounts / Debit Card |
| **More**     | "•••" icon           | Settings hub                                   |

A floating circular **coral "+" FAB** (bottom-right) opens the Transaction Form on Trans / Stats / Accounts tabs.

### 1.1 Screen inventory

**Trans tab**
- `transactions_daily_screen.dart` — IMG_1826: per-day grouped list with Income / Exp. / Total row.
- `transactions_calendar_screen.dart` — IMG_1827: month-grid with per-day total numbers, weekday header (Sun→Sat with Sun red / Sat blue).
- `transactions_monthly_screen.dart` — IMG_1828: month roll-up + weekly buckets, highlighted current week.
- `transactions_summary_screen.dart` — IMG_1829: account-group expense summary card, Budget progress, "Export data to Excel".
- `transactions_description_screen.dart` — placeholder description tab (low priority).

**Trans tab — chrome / actions**
- `transactions_header.dart` — search · "Trans." title · favorites star · filter sliders icon.
- `month_picker_bar.dart` — `< Jan 2026 >` with horizontal swipe to change month.

**Transaction form**
- `transaction_form_screen.dart` — three pill tabs (Income blue / Expense red / Transfer white outline — IMG_1830/31/32). Rows: Date · Amount · Category · Account · Note. Bottom action row: Save (filled, tab-color-tinted) + Continue (outline). Description input + camera icon docked above keyboard.
- `amount_calculator_sheet.dart` — IMG_1833: full-screen calculator keypad (+ − × ÷, 0/00/000, OK).

**Stats tab**
- `stats_screen.dart` — IMG_1834: Stats / Budget / Note tabs, Income/Exp toggle. The **"M/W/Y" period button** opens a sheet to filter by Month / Week / Year (`StatsPeriod`); the screen keeps its own day-granular `_anchor` (independent of the global Trans. month), the `< … >` bar steps it by the active unit and shows the range label, and `rangeFor()` → `_rangeTransactionsProvider((from, to))` drives all three tabs. **Stats** = interactive pie (tap a slice/row to select — it pops out + shows %) over a category list with % badge. **Budget** = "Remaining (Monthly)" header + "Budget Setting >" (→ `/settings/budget`) + a Monthly progress bar with a "Today" marker (from `budgetsRepository.status(month, year)` via `_budgetStatusProvider` — always the anchor month, since the budget API is monthly), over the per-category spend list. **Note** = transactions grouped by note (`aggregateNotes`): note · count · amount, sorted by count then amount.

**Accounts tab**
- `accounts_screen.dart` — IMG_1835: Assets / Liabilities / Total summary header; sections per Account Group; pencil (edit-mode) + plus (add) icons.
- `account_form_screen.dart` — IMG_1836: Group / Name / Amount / Description + Save.

**More / Settings tab**
- `settings_screen.dart` — IMG_1844, IMG_2244: grouped list (Transaction Settings, Repeat Setting, Copy-Paste, Income/Expenses Category, Accounts Setting, Budget, Backup, Passcode, Currencies, Alarm, Style, Application Icon, Language).
- `transaction_settings_screen.dart` — IMG_1848.
- `category_list_screen.dart` (income / expense) — IMG_1846, IMG_1847: reorderable rows with delete pill, edit pencil, drag handle.
- `category_edit_screen.dart` — Screenshot 2026-01-06 16.05.56: emoji prefix + name + Save.
- `accounts_settings_screen.dart` — IMG_2247: Account Group · Accounts Setting · Include in totals · Transfer-Expense · Deleted accounts · Card expenses display config.
- `account_group_screen.dart` — IMG_2248.
- `account_simple_list_screen.dart` — IMG_2249.
- `accounts_include_in_totals_screen.dart` — IMG_2250.
- `card_expenses_display_sheet.dart` — IMG_2251 modal sheet (A. At the time / B. Lump sum / Cancel).
- `transfer_expense_setting_screen.dart` — IMG_2252 (empty state with cat illustration).
- `main_currency_screen.dart` — IMG_1849 / IMG_2258.
- `currency_picker_screen.dart` — IMG_2259 (search + grouped A–Z list).
- `sub_currency_screen.dart` — IMG_2260 (SGD/USD with FX rate refresh FAB).

---

## 2. Reuse of Oewang Design Tokens

The Flutter app must look and feel like the same product family. We translate the existing CSS / Next.js tokens 1:1 into Dart constants in `apps/native/lib/core/theme/`.

### 2.1 Colors (port of `packages/ui/src/globals.css`)

Because the screenshots are exclusively dark, ship dark theme first and light theme later. Source of truth: the `.dark` block.

```dart
// apps/native/lib/core/theme/oewang_colors.dart
class OewangColors {
  // Dark theme (default for v1)
  static const background       = Color(0xFF0D0D0D);  // hsl(0 0% 5%)
  static const foreground       = Color(0xFFFAFAFA);  // hsl(0 0% 98%)
  static const card             = Color(0xFF121212);  // hsl(0 0% 7%)
  static const cardForeground   = Color(0xFFFAFAFA);
  static const muted            = Color(0xFF1C1C1C);  // hsl(0 0% 11%)
  static const mutedForeground  = Color(0xFF616161);  // hsl(0 0% 38%)
  static const accent           = Color(0xFF1C1C1C);
  static const border           = Color(0xFF1C1C1C);
  static const input            = Color(0xFF1C1C1C);
  static const primary          = Color(0xFFFAFAFA);
  static const ring             = Color(0xFFD4D4D8);

  // Semantic — matches `--green` / `--red` / `--destructive` in dark mode
  static const income           = Color(0xFF00C781);  // hsl(151 100% 39%) — closest to screenshot "Income blue"; use this for amounts marked green
  static const incomeBlue       = Color(0xFF4D9CFF);  // matches IMG_1830 "Income" pill / blue amounts in IMG_1826
  static const expense          = Color(0xFFFF5A5F);  // hsl(357 85% 64%) — the coral FAB & "Expense" pill
  static const destructive      = Color(0xFFFF3838);  // hsl(359 100% 61%)
  static const transferOutline  = Color(0xFFFAFAFA);  // Transfer = white outline

  // Calendar weekday colors (IMG_1827)
  static const sundayRed        = expense;
  static const saturdayBlue     = incomeBlue;
}
```

> **Note on income color.** The web tokens use `--green` (`hsl(151 100% 39%)`) for income, but the screenshots show **blue** for income (the Income pill + amount columns in IMG_1826). We expose both — `OewangColors.income` (green, matches web) and `OewangColors.incomeBlue` (matches mobile screenshots). The Transaction Settings → "Income-Expenses Color Setting" toggle (IMG_1848) decides which to use at runtime.

### 2.2 Typography (port of `packages/ui/src/lib/fonts/registry.ts`)

The web app already uses **Hedvig Letters Sans** as the default UI font, **Hedvig Letters Serif** for emphasis (per the recent commit `cad4a22` — currency display uses `font-serif` + tabular-nums), and **Geist Mono** for code. All three are on Google Fonts.

```dart
// apps/native/lib/core/theme/oewang_typography.dart
import 'package:google_fonts/google_fonts.dart';

class OewangFonts {
  static TextStyle sans({ /* size, weight, color */ }) =>
      GoogleFonts.hedvigLettersSans(/* ... */);

  // For currency / numeric display — matches `font-serif tabular-nums` in
  // calendar + transaction list (see commit cad4a22 on web).
  static TextStyle currency({ /* ... */ }) =>
      GoogleFonts.hedvigLettersSerif(/* ... */).copyWith(
        fontFeatures: const [FontFeature.tabularFigures()],
      );

  static TextStyle mono({ /* ... */ }) =>
      GoogleFonts.geistMono(/* ... */);
}
```

Apply Hedvig Sans as the global `textTheme` in `ThemeData`; opt into Serif explicitly anywhere a `Rp 1.952.500,00` is shown.

### 2.3 Radius & spacing

Web uses `--radius: 0.5rem` (~8 px) with calc-based sm/md/lg/xl. Mirror as:

```dart
class OewangRadius {
  static const sm = 4.0;
  static const md = 6.0;
  static const lg = 8.0;
  static const xl = 12.0;
  static const pill = 999.0; // for the FAB and segmented pills
}
```

---

## 3. Project Setup

### 3.1 Create the Flutter app

```bash
cd apps
flutter create --org com.oewang --platforms=ios,android native
```

Add to root `package.json` `workspaces` (Turborepo can shell out to Flutter via a `package.json` script in `apps/native/` even though Flutter is not a JS package).

### 3.2 Dependencies (pubspec.yaml)

| Package                  | Reason                                                       |
| ------------------------ | ------------------------------------------------------------ |
| `flutter_riverpod`       | State management — matches the data-fetching mental model already used with TanStack Query on web. |
| `dio` + `dio_cookie_manager` | HTTP client; mirror `axiosInstance` (Bearer + interceptors). |
| `flutter_secure_storage` | Store the `oewang-session` JWT securely (Keychain / Keystore). |
| `freezed` + `json_serializable` | Generate immutable models from the API DTOs.            |
| `google_fonts`           | Pull Hedvig Letters Sans / Serif and Geist Mono.             |
| `intl`                   | Currency + date formatting (`Rp 1.952.500,00`, weekday tokens). |
| `fl_chart`               | Pie chart on the Stats screen (IMG_1834).                    |
| `table_calendar`         | Calendar grid (IMG_1827).                                    |
| `go_router`              | Declarative routing with bottom-nav shells.                  |
| `pointycastle`           | AES-256-GCM encrypt/decrypt to mirror `packages/encryption`. |
| `flutter_dotenv`         | Load `API_URL` / `ENCRYPTION_KEY` from `.env`.               |
| `cached_network_image`   | Receipt / avatar images.                                     |
| `image_picker`           | Camera icon → receipt capture (IMG_1830 Description row).    |

### 3.3 Folder layout — MVVM + Repository (Flutter official architecture)

Per Flutter's [App Architecture Recommendations](https://docs.flutter.dev/app-architecture/recommendations), every feature is split into **`ui/` (Views + ViewModels)** and **`data/` (Repositories + Services + DTOs)**. Domain types are shared. Widgets stay "dumb" — all logic lives in ViewModels.

```
apps/native/
  lib/
    main.dart                      # bootstrap + DI container (Provider/Riverpod)
    app.dart                       # MaterialApp.router + theme wiring
    config/
      env.dart                     # reads .env
      dependencies.dart            # builds the DI graph (real vs fake repos)
    core/
      theme/
        oewang_colors.dart
        oewang_typography.dart
        oewang_radius.dart
        app_theme.dart             # ThemeData.dark() wired with the above
      command/
        command.dart               # Command<Input, Output> — see §4.3
      result/
        result.dart                # sealed Result<T, E> for repo returns
      router/
        app_router.dart            # go_router with bottom-nav ShellRoute
    data/
      services/                    # 1:1 with external systems (HTTP, secure storage, …)
        api/
          api_client.dart          # Dio wrapper, base URL, interceptors
          encryption_interceptor.dart
          auth_interceptor.dart
        storage/
          secure_storage_service.dart
      repositories/                # ABSTRACT — see §4.2
        auth_repository.dart
        transactions_repository.dart
        wallets_repository.dart
        categories_repository.dart
        budgets_repository.dart
        settings_repository.dart
      repositories_remote/         # production Dio-backed implementations
        auth_repository_remote.dart
        transactions_repository_remote.dart
        …
      repositories_fake/           # in-memory fakes for tests + previews
        auth_repository_fake.dart
        …
      dto/                         # wire-level models, JSON ⇄ Dart (freezed)
        transaction_dto.dart
        wallet_dto.dart
        …
    domain/
      models/                      # UI/domain models (freezed) — never tied to JSON
        transaction.dart
        wallet.dart
        category.dart
        money.dart                 # value object: amount + currency
      mappers/                     # DTO ⇄ domain model (kept out of ViewModels)
    ui/
      core/                        # reusable widgets (no ViewModel coupling)
        money_text.dart            # Hedvig Serif + tabular-nums
        section_header.dart
        segmented_pill_tabs.dart   # Income/Expense/Transfer pill row
        rounded_list_tile.dart
      shell/
        main_shell.dart            # 4-tab bottom nav + central FAB
        oewang_bottom_nav.dart
        oewang_fab.dart
      auth/
        view_models/
          login_view_model.dart    # ChangeNotifier (or AsyncNotifier in Riverpod)
        widgets/
          login_screen.dart        # View — listens, never owns logic
      transactions/
        view_models/
          transactions_daily_view_model.dart
          transactions_calendar_view_model.dart
          transaction_form_view_model.dart
        widgets/
          transactions_daily_screen.dart
          transactions_calendar_screen.dart
          transactions_monthly_screen.dart
          transactions_summary_screen.dart
          transaction_form_screen.dart
          amount_calculator_sheet.dart
          month_picker_bar.dart
          transaction_row.dart
          transactions_header.dart
      stats/         { view_models/, widgets/ }
      wallets/       { view_models/, widgets/ }   # "Accounts" in the UI
      categories/    { view_models/, widgets/ }
      budgets/       { view_models/, widgets/ }
      settings/      { view_models/, widgets/ }
  test/
    unit/            # services, repositories, mappers, ViewModels (with fakes)
    widget/          # screens with fake repos via DI override
    integration/     # full flows against a Docker-composed API
  pubspec.yaml
  .env.example
```

**Why this shape, not a flat `features/` tree.** Flutter explicitly recommends data + UI layers with the Repository pattern. Splitting `data/repositories/` (abstract) from `repositories_remote/` (Dio) and `repositories_fake/` (in-memory) lets us swap implementations per environment and makes `Strongly recommend: Make fakes for testing` natural.

---

## 4. Architecture in Practice

### 4.1 Layer rules (enforced)

| Layer        | May import from              | Forbidden                                            |
| ------------ | ---------------------------- | ---------------------------------------------------- |
| `ui/widgets/`     | `view_models/`, `ui/core/`, `domain/models/`, `core/` | `data/`, `dio`, `http`, JSON         |
| `ui/view_models/` | `data/repositories/` (abstract), `domain/models/`, `core/command/` | `dio`, `data/services/`, widgets |
| `data/repositories/` (abstract) | `domain/models/`, `core/result/` | widgets, `dio`, services            |
| `data/repositories_remote/` | abstract repo, `data/services/`, `data/dto/`, `domain/mappers/` | widgets, view_models      |
| `data/services/`            | `dio`, `flutter_secure_storage` | repos, view_models, widgets                       |
| `domain/`                   | nothing in `data/` or `ui/`     | (pure)                                            |

Enforced via `import_lint` and a lightweight `analysis_options.yaml` custom rule (or a CI grep).

### 4.2 The Repository pattern — abstract by default

`data/repositories/transactions_repository.dart` is **abstract**. Concrete `…_remote.dart` and `…_fake.dart` implement it. ViewModels depend only on the abstract type — they never know whether the data came from the API or memory.

```dart
abstract class TransactionsRepository {
  Future<Result<List<Transaction>, AppError>> list({
    required DateTime from,
    required DateTime to,
    TransactionType? type,
  });
  Future<Result<Transaction, AppError>> create(NewTransactionDraft draft);
  Stream<List<Transaction>> watchForDay(DateTime day);
}
```

This makes the "Strongly recommend: Make fakes for testing" point trivial — `TransactionsRepositoryFake` lives next to the real one and is wired into widget/integration tests via DI override.

### 4.3 The Command pattern — guards UI actions

Per the Flutter docs ("Use Commands to handle events"), every UI action that triggers a repository call goes through a `Command`. It exposes `running`, `error`, and `result` and is reused by buttons so we don't reinvent disable/spinner/error logic on every screen.

```dart
class Command<Input, Output> extends ChangeNotifier {
  Command(this._action);
  final Future<Result<Output, AppError>> Function(Input) _action;
  bool running = false;
  AppError? error;
  Output? result;
  Future<void> run(Input input) async {
    running = true; error = null; notifyListeners();
    final res = await _action(input);
    res.fold((ok) => result = ok, (e) => error = e);
    running = false; notifyListeners();
  }
}
```

Used in `TransactionFormViewModel.saveCommand` so the Save button in IMG_1830/31/32 binds to a single source of disabled / spinning / error truth.

### 4.4 Unidirectional data flow

```
View  ─events──▶  ViewModel  ─calls──▶  Repository  ─HTTP──▶  API
View  ◀──state──  ViewModel  ◀──data──  Repository
```

Views **only**: listen to ViewModel state, render, dispatch events.
ViewModels **only**: own UI state, call repositories, expose Commands.
Repositories **only**: own data, expose `Future`/`Stream` of domain models, never know about widgets.

### 4.5 State management — Riverpod

We pick **Riverpod** over plain `Provider` + `ChangeNotifier` because:

- Compile-time safe DI (no `BuildContext` lookups at runtime).
- `AsyncNotifier` / `FutureProvider` map cleanly to ViewModel + Command outputs.
- Provider override = trivial fake injection for widget tests.
- Matches the team's mental model from TanStack Query on web (`useQuery` ↔ `ref.watch(transactionsProvider)`).

ChangeNotifier ViewModels are still allowed for forms / local UI state — Riverpod orchestrates them via `ChangeNotifierProvider`.

### 4.6 Immutable domain models — freezed

Every domain model (`Transaction`, `Wallet`, `Category`, `Money`) is a `@freezed` class with generated `copyWith`, deep equality, and JSON codecs. Mutability is forbidden — state changes always go through `copyWith` and `notifyListeners`.

```dart
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
```

### 4.7 Error handling

- Repositories return `Result<Ok, AppError>` — no thrown `DioException` leaks into ViewModels.
- `AppError` is a sealed class: `Network`, `Unauthorized`, `Validation(field, message)`, `Server(code)`, `Unknown`.
- ViewModels translate `AppError` into user-facing strings via the dictionary system.
- A global `Dio` error interceptor maps HTTP status → `AppError` once, so repositories don't repeat the mapping.

---

## 5. Networking & Auth Parity

### 5.1 Base URL & encryption

Mirror `packages/modules/src/lib/axios.server.ts`:

- `baseUrl = ${API_URL}/v1` (defaults to `http://localhost:3002/v1` in dev).
- Bearer `oewang-session` JWT in `Authorization` header.
- Request body: AES-256-GCM encrypt with `ENCRYPTION_KEY`, wrap as `{ data: <ciphertext> }`, set `x-encrypted: true`.
- Response: if `x-encrypted: true`, decrypt → parse as `ApiResponse<T>`.

```dart
// apps/native/lib/core/network/encryption_interceptor.dart
class EncryptionInterceptor extends Interceptor {
  final String key; // hex / base64 — match @workspace/encryption format

  @override
  void onRequest(options, handler) {
    if (['POST','PUT','PATCH'].contains(options.method) && options.data is! FormData) {
      final cipher = aesGcmEncrypt(jsonEncode(options.data), key);
      options.data = {'data': cipher};
      options.headers['x-encrypted'] = 'true';
    }
    handler.next(options);
  }

  @override
  void onResponse(response, handler) {
    if (response.headers.value('x-encrypted') == 'true') {
      final plain = aesGcmDecrypt(response.data['data'] as String, key);
      response.data = jsonDecode(plain);
    }
    handler.next(response);
  }
}
```

The Dart implementation **must produce the exact wire format** of `packages/encryption/src/index.ts`. Cross-check by encrypting a known plaintext on both sides.

### 5.2 Auth flow

1. `POST /v1/auth/login` with email/password → response carries JWT.
2. Persist via `flutter_secure_storage` under key `oewang-session`.
3. `dio_client` injects it as `Authorization: Bearer <jwt>`.
4. On 401, clear storage and route to `/login`.

Refresh-token logic, OAuth providers, and onboarding can defer to Phase 2.

---

## 6. API → Screen Mapping (mobile MVP)

| Screen                          | API module                       | Endpoints (existing in `apps/api/modules/`)                  |
| ------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| Login                           | `auth`                           | `POST /v1/auth/login`                                        |
| Transactions Daily / Calendar / Monthly / Summary | `transactions`         | `GET /v1/transactions` (range + group params), `GET /v1/transactions/summary` |
| Transaction Form (Income/Expense) | `transactions`, `categories`, `wallets` | `POST /v1/transactions`, `GET /v1/categories`, `GET /v1/wallets` |
| Transaction Form (Transfer)     | `transactions`                   | `POST /v1/transactions` with `type=transfer`, From / To = wallet IDs |
| Stats                           | `transactions`                   | `GET /v1/transactions/aggregate?groupBy=category&period=M`   |
| Accounts                        | `wallets`, `wallets/groups`      | `GET /v1/wallets`, `GET /v1/wallets/groups`                  |
| Account Form                    | `wallets`                        | `POST /v1/wallets`, `PUT /v1/wallets/:id`                    |
| Category list & edit            | `categories`                     | `GET /v1/categories?type=income\|expense`, `POST/PUT/DELETE` |
| Budget Setting / Summary card   | `budgets`                        | `GET /v1/budgets`, `POST /v1/budgets`                        |
| Currency settings (main/sub)    | `settings`                       | `GET /v1/settings/currencies/main`, `GET /v1/settings/currencies/sub` |
| Transaction Settings            | `settings`                       | `GET/PATCH /v1/settings/transaction`                         |
| Notifications (Alarm)           | `notifications`, `notification-settings` | `GET /v1/notification-settings`, `PUT /v1/notification-settings/:id` |

> Confirm each path against the real Elysia controllers when implementing — controllers chain `.get(...)` calls under `prefix: "/transactions"` etc.; only the prefixes are listed above with high confidence.

---

## 7. Component Plan — the parts the screenshots demand

These are *layout* components driven by the screenshots, themed with the web tokens:

- **`OewangBottomNav`** — 4 items, active item gets `OewangColors.expense` tint (matches IMG_1826 "05/01" + IMG_1834 "Stats"). Today's date (`dd/MM`) is rendered inside the Trans icon.
- **`OewangFab`** — 56-pt circle, fill `OewangColors.expense`, white "+", elevated.
- **`SegmentedPillTabs`** — IMG_1830/31/32. Three pills, the active one outlined with the type color (Income = blue, Expense = red, Transfer = white).
- **`MoneyText`** — Serif + `FontFeature.tabularFigures()`, sign-aware coloring (positive blue, negative red), uses `intl` `NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 2)`.
- **`MonthPickerBar`** — `<` `Jan 2026` `>` with horizontal `PageView` for swipe.
- **`SubTabBar`** — Daily / Calendar / Monthly / Summary with red underline under the active label (matches the consistent header across IMG_1826–29).
- **`CategoryPieChart`** — `fl_chart` `PieChart`, label leaders matching IMG_1834.
- **`AmountCalculatorSheet`** — full-height `ModalBottomSheet` with custom keypad, returns a `Decimal` to the form.
- **`SectionedAccountsList`** — IMG_1835 / IMG_1849: section header (muted) + rows with right-aligned `MoneyText`.
- **`ReorderableCategoryList`** — IMG_1846/47: leading red minus, emoji + name, trailing edit + drag handle.

---

## 8. Build Milestones

| # | Milestone                                  | Deliverable                                                  |
| - | ------------------------------------------ | ------------------------------------------------------------ |
| 0 | **Bootstrap**                              | `flutter create`, lints, CI smoke build, `app_theme.dart` with the dark Oewang palette + Hedvig fonts visible on a blank screen. |
| 1 | **App shell + navigation**                 | Bottom nav with 4 tabs, central FAB, placeholder screens for each, `go_router` shell route. |
| 2 | **Auth**                                   | Login screen, secure-storage JWT, dio client + encryption interceptor, 401 redirect. End-to-end against `apps/api` running locally. |
| 3 | **Transactions — Daily list**              | `GET /v1/transactions` for current month, grouped-by-day list (IMG_1826), Income/Exp/Total header. |
| 4 | **Transaction Form (Income & Expense)**    | Segmented pills, calculator sheet, category picker, account picker, `POST /v1/transactions`. Save + Continue both functional. |
| 5 | **Transactions — Calendar / Monthly / Summary** | IMG_1827–29. `table_calendar` grid with per-day totals, monthly buckets, summary card + budget bar. |
| 6 | **Accounts tab + Account Form**            | IMG_1835/36. Grouped list, assets/liabilities header, add/edit account. |
| 7 | **Transfer transactions**                  | Transfer pill, From/To pickers, swap button (IMG_1832), Fees field. |
| 8 | **Stats**                                  | IMG_1834. Pie chart + category list with % badges, period dropdown. |
| 9 | **Settings hub**                           | IMG_1844 + IMG_2244 nav, Transaction Settings (IMG_1848), Categories CRUD (IMG_1846/47 + edit screen). |
| 10 | **Currency settings**                     | IMG_1849, IMG_2258–60. Main currency, sub-currency list, currency picker with grouped A–Z. |
| 11 | **Accounts settings**                     | IMG_2247–52. Account Group, Include in Totals, Card expenses display sheet, Transfer-Expense setting empty state. |
| 12 | **Polish + light theme**                  | Add the light `:root` token set as an alternate `ThemeData`; respect system `Brightness` and the web app's Style setting. |

Each milestone ships behind a `flutter run` smoke test against a locally running `apps/api` (`bun run dev` from the API directory).

---

## 9. Testing Strategy

Follows Flutter's "Strongly recommend: Test architectural components separately and together" rule.

| Layer        | Test type   | What to assert                                                       |
| ------------ | ----------- | -------------------------------------------------------------------- |
| Services     | Unit        | `ApiClient` request shape, encryption round-trip, error mapping.    |
| Repositories (remote) | Unit | Maps DTO → domain correctly; converts HTTP errors → `AppError`.   |
| Repositories (fake)   | Unit | In-memory store behaves as spec'd so widget tests are reliable.   |
| ViewModels   | Unit        | State transitions, Commands, calls to the abstract repository (fake injected). |
| Views        | Widget      | Renders given a fixed ViewModel state; FAB tap dispatches expected event. |
| Screens      | Widget + Golden | Pixel-locked match against `docs/MOBILE/UI/` references.        |
| Flows        | Integration | Login → Add transaction → list updates, against Docker-composed API. |

- **Fakes over mocks** — `data/repositories_fake/` holds reusable fakes injected via Riverpod overrides. Mockito is allowed only when a fake would be more code than the test.
- Reuse fixture data from `packages/database/seed` so mobile and web see the same baseline.
- Goldens regenerate via `flutter test --update-goldens` on macOS to lock layout against the screenshots.

---

## 10. Out of Scope for v1

- Push notifications (already covered by `apps/api/modules/push-subscriptions` — surface them only after the read flows work).
- OAuth (Google / Apple sign-in).
- Offline-first sync (Drift / sqflite) — defer; v1 requires network.
- Receipt OCR / AI tools (`packages/ai`) — defer.
- Web/Desktop targets — Flutter project will only declare `ios` and `android` for now.

---

## 11. Open Questions

1. **Income color** — the web uses green (`--green`), screenshots use blue. Which is the canonical default? (Plan exposes both and lets the Transaction Settings toggle pick.)
2. **Encryption key delivery** — does the mobile client ship with a static `ENCRYPTION_KEY` (matching the server), or do we move to a per-session derived key? Current axios setup uses a static env var, so we'll mirror that initially.
3. **Locale** — screenshots show `id_ID` (Rp, comma decimals). Confirm `intl` locale and whether the existing dictionary system in `apps/app` should be ported into Flutter `.arb` files.
4. **App store identifier** — confirm `com.oewang` bundle ID before iOS provisioning.
