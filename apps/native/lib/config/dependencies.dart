import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/data/repositories/auth_repository.dart';
import 'package:oewang/data/repositories/budgets_repository.dart';
import 'package:oewang/data/repositories/categories_repository.dart';
import 'package:oewang/data/repositories/settings_repository.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/repositories/wallet_groups_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories_remote/auth_repository_remote.dart';
import 'package:oewang/data/repositories_remote/budgets_repository_remote.dart';
import 'package:oewang/data/repositories_remote/categories_repository_remote.dart';
import 'package:oewang/data/repositories_remote/settings_repository_remote.dart';
import 'package:oewang/data/repositories_remote/transactions_repository_remote.dart';
import 'package:oewang/data/repositories_remote/wallet_groups_repository_remote.dart';
import 'package:oewang/data/repositories_remote/wallets_repository_remote.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/storage/preferences_service.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';
import 'package:oewang/domain/models/session.dart';

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

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepositoryRemote(
    api: ref.watch(apiClientProvider),
    storage: ref.watch(secureStorageProvider),
    env: ref.watch(envProvider),
  );
});

final transactionsRepositoryProvider = Provider<TransactionsRepository>((ref) {
  return TransactionsRepositoryRemote(ref.watch(apiClientProvider));
});

final walletsRepositoryProvider = Provider<WalletsRepository>((ref) {
  return WalletsRepositoryRemote(ref.watch(apiClientProvider));
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
  return CategoriesRepositoryRemote(ref.watch(apiClientProvider));
});

final settingsRepositoryProvider = Provider<SettingsRepository>((ref) {
  return SettingsRepositoryRemote(ref.watch(apiClientProvider));
});

final budgetsRepositoryProvider = Provider<BudgetsRepository>((ref) {
  return BudgetsRepositoryRemote(ref.watch(apiClientProvider));
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
class TransactionColorSchemeController extends Notifier<TransactionColorScheme> {
  @override
  TransactionColorScheme build() {
    // Re-hydrate whenever the session flips to logged-in.
    ref.listen<AsyncValue<Session?>>(sessionControllerProvider, (prev, next) {
      if (next.valueOrNull != null) {
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
}

final transactionColorSchemeProvider =
    NotifierProvider<TransactionColorSchemeController, TransactionColorScheme>(
      TransactionColorSchemeController.new,
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
    state = const AsyncValue.data(null);
  }
}

final sessionControllerProvider =
    NotifierProvider<SessionController, AsyncValue<Session?>>(
      SessionController.new,
    );
