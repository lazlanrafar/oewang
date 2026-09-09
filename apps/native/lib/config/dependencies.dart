import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/data/repositories/auth_repository.dart';
import 'package:oewang/data/repositories/budgets_repository.dart';
import 'package:oewang/data/repositories/categories_repository.dart';
import 'package:oewang/data/repositories/contacts_repository.dart';
import 'package:oewang/data/repositories/debts_repository.dart';
import 'package:oewang/data/repositories/rates_repository.dart';
import 'package:oewang/data/repositories/settings_repository.dart';
import 'package:oewang/data/repositories/sub_currencies_repository.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/repositories/users_repository.dart';
import 'package:oewang/data/repositories/wallet_groups_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories/workspaces_repository.dart';
import 'package:oewang/data/repositories_remote/auth_repository_remote.dart';
import 'package:oewang/data/repositories_remote/budgets_repository_offline.dart';
import 'package:oewang/data/repositories_remote/budgets_repository_remote.dart';
import 'package:oewang/data/repositories_remote/categories_repository_offline.dart';
import 'package:oewang/data/repositories_remote/categories_repository_remote.dart';
import 'package:oewang/data/repositories_remote/contacts_repository_offline.dart';
import 'package:oewang/data/repositories_remote/contacts_repository_remote.dart';
import 'package:oewang/data/repositories_remote/debts_repository_offline.dart';
import 'package:oewang/data/repositories_remote/debts_repository_remote.dart';
import 'package:oewang/data/repositories_remote/rates_repository_remote.dart';
import 'package:oewang/data/repositories_remote/settings_repository_remote.dart';
import 'package:oewang/data/repositories_remote/sub_currencies_repository_remote.dart';
import 'package:oewang/data/repositories_remote/transactions_repository_offline.dart';
import 'package:oewang/data/repositories_remote/transactions_repository_remote.dart';
import 'package:oewang/data/repositories_remote/users_repository_remote.dart';
import 'package:oewang/data/repositories_remote/wallet_groups_repository_remote.dart';
import 'package:oewang/data/repositories_remote/wallets_repository_offline.dart';
import 'package:oewang/data/repositories_remote/wallets_repository_remote.dart';
import 'package:oewang/data/repositories_remote/workspaces_repository_remote.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/connectivity/connectivity_service.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/data/services/notifications/notifications_service.dart';
import 'package:oewang/data/services/storage/preferences_service.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';
import 'package:oewang/data/services/sync/sync_service.dart';
import 'package:oewang/data/services/sync/sync_trigger.dart';
import 'package:oewang/domain/models/session.dart';
import 'package:oewang/domain/models/sub_currency.dart';
import 'package:oewang/domain/models/transaction_settings.dart';
import 'package:rxdart/rxdart.dart';

/// Root env provider. Loaded once at startup by main.dart.
final envProvider = Provider<EnvConfig>((ref) {
  throw UnimplementedError('Override in ProviderScope at startup');
});

final secureStorageProvider = Provider<SecureStorageService>((ref) {
  return SecureStorageService();
});

/// Bootstrapped in main.dart and overridden in [ProviderScope].
final preferencesServiceProvider = Provider<PreferencesService>((ref) {
  throw UnimplementedError('Override in ProviderScope at startup');
});

final apiClientProvider = Provider<ApiClient>((ref) {
  final env = ref.watch(envProvider);
  final storage = ref.watch(secureStorageProvider);
  return ApiClient.build(
    env: env,
    storage: storage,
    onUnauthorized: () async {
      await ref.read(sessionControllerProvider.notifier).clear();
    },
  );
});

/// Local offline cache (Drift/SQLite). One instance for the app's lifetime —
/// wiped on logout via [SessionController.clear].
final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});

final connectivityServiceProvider = Provider<ConnectivityService>((ref) {
  return ConnectivityService();
});

final syncServiceProvider = Provider<SyncService>((ref) {
  return SyncService(
    db: ref.watch(appDatabaseProvider),
    api: ref.watch(apiClientProvider),
    workspaceId: () => _currentWorkspaceId(ref),
  );
});

final notificationsServiceProvider = Provider<NotificationsService>((ref) {
  return NotificationsService()..init();
});

/// Kept alive for the app's lifetime by [OewangApp] watching it once at the
/// root — see app.dart. Subscribes to connectivity + app-resume and flushes
/// the offline sync queue on both.
final syncTriggerProvider = Provider<SyncTrigger>((ref) {
  final trigger = SyncTrigger(
    connectivity: ref.watch(connectivityServiceProvider),
    sync: ref.watch(syncServiceProvider),
  );
  ref.onDispose(trigger.dispose);
  return trigger;
});

/// Current workspace id, read lazily by the offline repositories at call
/// time (mirrors how [apiClientProvider] itself isn't rebuilt on workspace
/// switches — the server scopes requests via the JWT either way).
String _currentWorkspaceId(Ref ref) =>
    ref.read(sessionControllerProvider).valueOrNull?.workspaceId ?? '';

/// Pending offline-write count across transactions/wallets/debts for the
/// current workspace — drives the small sync-status badge in the UI.
final pendingSyncCountProvider = StreamProvider<int>((ref) {
  final db = ref.watch(appDatabaseProvider);
  // watch (not read) — switching workspaces should rebuild this stream.
  final ws =
      ref.watch(sessionControllerProvider).valueOrNull?.workspaceId ?? '';
  return Rx.combineLatest3<int, int, int, int>(
    db.watchPendingTransactionsCount(ws),
    db.watchPendingWalletsCount(ws),
    db.watchPendingDebtsCount(ws),
    (a, b, c) => a + b + c,
  );
});

final syncIssuesProvider = StreamProvider<List<(String, String)>>((ref) {
  final ws =
      ref.watch(sessionControllerProvider).valueOrNull?.workspaceId ?? '';
  return ref.watch(appDatabaseProvider).watchSyncIssues(ws);
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepositoryRemote(
    api: ref.watch(apiClientProvider),
    storage: ref.watch(secureStorageProvider),
    env: ref.watch(envProvider),
  );
});

final transactionsRepositoryProvider = Provider<TransactionsRepository>((ref) {
  return TransactionsRepositoryOffline(
    remote: TransactionsRepositoryRemote(ref.watch(apiClientProvider)),
    db: ref.watch(appDatabaseProvider),
    connectivity: ref.watch(connectivityServiceProvider),
    sync: ref.watch(syncServiceProvider),
    workspaceId: () => _currentWorkspaceId(ref),
  );
});

final walletsRepositoryProvider = Provider<WalletsRepository>((ref) {
  return WalletsRepositoryOffline(
    remote: WalletsRepositoryRemote(ref.watch(apiClientProvider)),
    db: ref.watch(appDatabaseProvider),
    connectivity: ref.watch(connectivityServiceProvider),
    sync: ref.watch(syncServiceProvider),
    workspaceId: () => _currentWorkspaceId(ref),
  );
});

final walletGroupsRepositoryProvider = Provider<WalletGroupsRepository>((ref) {
  return WalletGroupsRepositoryRemote(ref.watch(apiClientProvider));
});

/// Bumped whenever a wallet is created/edited/deleted so account-related
/// screens reload.
class WalletsRevisionController extends Notifier<int> {
  @override
  int build() => 0;
  void bump() => state = state + 1;
}

final walletsRevisionProvider =
    NotifierProvider<WalletsRevisionController, int>(
      WalletsRevisionController.new,
    );

final categoriesRepositoryProvider = Provider<CategoriesRepository>((ref) {
  return CategoriesRepositoryOffline(
    remote: CategoriesRepositoryRemote(ref.watch(apiClientProvider)),
    db: ref.watch(appDatabaseProvider),
    workspaceId: () => _currentWorkspaceId(ref),
  );
});

final settingsRepositoryProvider = Provider<SettingsRepository>((ref) {
  return SettingsRepositoryRemote(
    ref.watch(apiClientProvider),
    ref.watch(preferencesServiceProvider),
  );
});

final budgetsRepositoryProvider = Provider<BudgetsRepository>((ref) {
  return BudgetsRepositoryOffline(
    remote: BudgetsRepositoryRemote(ref.watch(apiClientProvider)),
    db: ref.watch(appDatabaseProvider),
    workspaceId: () => _currentWorkspaceId(ref),
  );
});

/// Bumped after a budget is created/edited/deleted so the Budget screen reloads.
class BudgetsRevisionController extends Notifier<int> {
  @override
  int build() => 0;
  void bump() => state = state + 1;
}

final budgetsRevisionProvider =
    NotifierProvider<BudgetsRevisionController, int>(
      BudgetsRevisionController.new,
    );

final contactsRepositoryProvider = Provider<ContactsRepository>((ref) {
  return ContactsRepositoryOffline(
    remote: ContactsRepositoryRemote(ref.watch(apiClientProvider)),
    db: ref.watch(appDatabaseProvider),
    workspaceId: () => _currentWorkspaceId(ref),
  );
});

final debtsRepositoryProvider = Provider<DebtsRepository>((ref) {
  return DebtsRepositoryOffline(
    remote: DebtsRepositoryRemote(ref.watch(apiClientProvider)),
    db: ref.watch(appDatabaseProvider),
    connectivity: ref.watch(connectivityServiceProvider),
    sync: ref.watch(syncServiceProvider),
    workspaceId: () => _currentWorkspaceId(ref),
  );
});

/// Bumped after a debt is created/edited/deleted/paid so the Debt screen reloads.
class DebtsRevisionController extends Notifier<int> {
  @override
  int build() => 0;
  void bump() => state = state + 1;
}

final debtsRevisionProvider = NotifierProvider<DebtsRevisionController, int>(
  DebtsRevisionController.new,
);

final subCurrenciesRepositoryProvider = Provider<SubCurrenciesRepository>((
  ref,
) {
  return SubCurrenciesRepositoryRemote(ref.watch(apiClientProvider));
});

final ratesRepositoryProvider = Provider<RatesRepository>((ref) {
  return RatesRepositoryRemote(ref.watch(apiClientProvider));
});

/// Workspace sub-currencies (the extra currencies the workspace tracks beyond
/// the IDR base). Global + cached so the currency settings screen and the
/// wallet form share one fetch. Not autoDispose — survives navigation.
/// `ref.invalidate(subCurrenciesProvider)` after a create/delete refetches.
final subCurrenciesProvider = FutureProvider<List<SubCurrency>>((ref) async {
  final res = await ref.watch(subCurrenciesRepositoryProvider).list();
  return res.fold((ok) => ok, (_) => const <SubCurrency>[]);
});

/// FX rates keyed by currency code, against the IDR base. Shares the global
/// cache with [subCurrenciesProvider].
final ratesProvider = FutureProvider<Map<String, double>>((ref) async {
  final res = await ref.watch(ratesRepositoryProvider).rates(base: 'IDR');
  return res.fold((ok) => ok, (_) => const <String, double>{});
});

final usersRepositoryProvider = Provider<UsersRepository>((ref) {
  return UsersRepositoryRemote(ref.watch(apiClientProvider));
});

final workspacesRepositoryProvider = Provider<WorkspacesRepository>((ref) {
  return WorkspacesRepositoryRemote(ref.watch(apiClientProvider));
});

/// Monotonically increasing integer bumped whenever a transaction is
/// successfully created. Screens that show transaction lists watch this and
/// reload when it changes.
class TransactionsRevisionController extends Notifier<int> {
  @override
  int build() => 0;
  void bump() => state = state + 1;
}

final transactionsRevisionProvider =
    NotifierProvider<TransactionsRevisionController, int>(
      TransactionsRevisionController.new,
    );

/// Active income/expense color scheme. Boots from local prefs (so the choice
/// survives restart), then hydrates from `/v1/settings/transaction` whenever
/// a session is active — server is authoritative.
class TransactionColorSchemeController
    extends Notifier<TransactionColorScheme> {
  @override
  TransactionColorScheme build() {
    // Re-hydrate only once the session has a workspace. A logged-in user
    // without one is mid-onboarding; authed reads would 401 and the 401
    // handler would clear the session, bouncing them back to login. (Mirrors
    // the web, whose create-workspace page loads no dashboard data.)
    ref.listen<AsyncValue<Session?>>(sessionControllerProvider, (prev, next) {
      final ws = next.valueOrNull?.workspaceId;
      if (ws != null && ws.isNotEmpty) {
        hydrateFromServer();
      }
    });
    return ref.read(preferencesServiceProvider).readTransactionColorScheme();
  }

  /// Pulls the current server-side `incomeExpensesColor` and updates state +
  /// local prefs. Silently no-ops on errors so the cached value sticks.
  Future<void> hydrateFromServer() async {
    final res = await ref
        .read(settingsRepositoryProvider)
        .fetchTransactionSettings();
    final settings = res.fold((ok) => ok, (_) => null);
    if (settings == null) return;
    if (state != settings.incomeExpensesColor) {
      state = settings.incomeExpensesColor;
      await ref
          .read(preferencesServiceProvider)
          .writeTransactionColorScheme(state);
    }
  }

  /// Updates state immediately, persists to local prefs for offline safety,
  /// then PATCHes the server. Server errors are silently swallowed — local
  /// state stays current and the next hydrate reconciles.
  Future<void> set(TransactionColorScheme scheme) async {
    state = scheme;
    await ref
        .read(preferencesServiceProvider)
        .writeTransactionColorScheme(scheme);
    await ref.read(settingsRepositoryProvider).updateColorScheme(scheme);
  }

  /// Updates state + local prefs only — for callers that already persisted the
  /// change server-side (e.g. the Transaction Settings screen).
  Future<void> applyLocal(TransactionColorScheme scheme) async {
    state = scheme;
    await ref
        .read(preferencesServiceProvider)
        .writeTransactionColorScheme(scheme);
  }
}

final transactionColorSchemeProvider =
    NotifierProvider<TransactionColorSchemeController, TransactionColorScheme>(
      TransactionColorSchemeController.new,
    );

/// Full workspace transaction settings for the Transaction Settings screen.
/// Color changes are delegated to [transactionColorSchemeProvider] so the
/// rest of the app re-colors immediately; all other fields PATCH directly.
class TransactionSettingsController extends AsyncNotifier<TransactionSettings> {
  @override
  Future<TransactionSettings> build() async {
    final res = await ref
        .read(settingsRepositoryProvider)
        .fetchTransactionSettings();
    return res.fold((ok) => ok, (_) => TransactionSettings.defaults());
  }

  Future<void> patch(Map<String, Object?> changes) async {
    final current = state.valueOrNull ?? TransactionSettings.defaults();
    final res = await ref
        .read(settingsRepositoryProvider)
        .updateTransactionSettings(changes);
    state = AsyncData(res.fold((ok) => ok, (_) => current));
    // Keep the app-wide color provider in sync without a second PATCH.
    if (changes.containsKey('incomeExpensesColor')) {
      await ref
          .read(transactionColorSchemeProvider.notifier)
          .applyLocal(state.value!.incomeExpensesColor);
    }
  }
}

final transactionSettingsProvider =
    AsyncNotifierProvider<TransactionSettingsController, TransactionSettings>(
      TransactionSettingsController.new,
    );

/// Active [ThemeMode] — `system` follows the OS, `light`/`dark` force one.
class ThemeModeController extends Notifier<ThemeMode> {
  @override
  ThemeMode build() => ref.read(preferencesServiceProvider).readThemeMode();

  Future<void> set(ThemeMode mode) async {
    state = mode;
    await ref.read(preferencesServiceProvider).writeThemeMode(mode);
  }
}

final themeModeProvider = NotifierProvider<ThemeModeController, ThemeMode>(
  ThemeModeController.new,
);

/// Single source of truth for "is the user logged in". The router redirect
/// listens to this; on logout / 401 the auth interceptor calls `clear`.
class SessionController extends Notifier<AsyncValue<Session?>> {
  @override
  AsyncValue<Session?> build() {
    _bootstrap();
    return const AsyncValue.loading();
  }

  Future<void> _bootstrap() async {
    try {
      final session = await ref.read(authRepositoryProvider).currentSession();
      state = AsyncValue.data(session);
    } on Exception catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  @visibleForTesting
  void setForTest(Session? session) => state = AsyncValue.data(session);

  void onLoggedIn(Session session) => state = AsyncValue.data(session);

  Future<void> clear() async {
    await ref.read(authRepositoryProvider).logout();
    // A shared device must not carry one account's cached financial data
    // (and any not-yet-synced offline writes) into the next session.
    await ref.read(appDatabaseProvider).clearAll();
    state = const AsyncValue.data(null);
  }
}

final sessionControllerProvider =
    NotifierProvider<SessionController, AsyncValue<Session?>>(
      SessionController.new,
    );
