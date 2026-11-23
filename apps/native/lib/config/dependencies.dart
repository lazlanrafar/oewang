import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/organisms/auth/auth_sync.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/data/repositories/auth_repository.dart';
import 'package:oewang/data/repositories/budgets_repository.dart';
import 'package:oewang/data/repositories/categories_repository.dart';
import 'package:oewang/data/repositories/feedback_repository.dart';
import 'package:oewang/data/repositories/rates_repository.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/repositories/users_repository.dart';
import 'package:oewang/data/repositories/vault_repository.dart';
import 'package:oewang/data/repositories/wallet_groups_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories/workspaces_repository.dart';
import 'package:oewang/data/repositories_remote/auth_repository_remote.dart';
import 'package:oewang/data/repositories_remote/budgets_repository_remote.dart';
import 'package:oewang/data/repositories_remote/categories_repository_remote.dart';
import 'package:oewang/data/repositories_remote/feedback_repository_remote.dart';
import 'package:oewang/data/repositories_remote/rates_repository_remote.dart';
import 'package:oewang/data/repositories_remote/transactions_repository_remote.dart';
import 'package:oewang/data/repositories_remote/users_repository_remote.dart';
import 'package:oewang/data/repositories_remote/vault_repository_remote.dart';
import 'package:oewang/data/repositories_remote/wallet_groups_repository_remote.dart';
import 'package:oewang/data/repositories_remote/wallets_repository_remote.dart';
import 'package:oewang/data/repositories_remote/workspaces_repository_remote.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/storage/preferences_service.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';
import 'package:oewang/domain/models/session.dart';
import 'package:oewang/domain/models/transaction_settings.dart';

/// Root env provider. Built once at startup by main.dart.
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
  return ApiClient.build(
    env: ref.watch(envProvider),
    storage: ref.watch(secureStorageProvider),
    // The interceptor has already cleared the tokens.
    onSignedOut: () async =>
        ref.read(sessionControllerProvider.notifier).signedOut(),
  );
});

final feedbackRepositoryProvider = Provider<FeedbackRepository>((ref) {
  return FeedbackRepositoryRemote(ref.watch(apiClientProvider));
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepositoryRemote(
    api: ref.watch(apiClientProvider),
    storage: ref.watch(secureStorageProvider),
  );
});

final vaultRepositoryProvider = Provider<VaultRepository>((ref) {
  return VaultRepositoryRemote(ref.watch(apiClientProvider));
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

final budgetsRepositoryProvider = Provider<BudgetsRepository>((ref) {
  return BudgetsRepositoryRemote(ref.watch(apiClientProvider));
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

final ratesRepositoryProvider = Provider<RatesRepository>((ref) {
  return RatesRepositoryRemote(ref.watch(apiClientProvider));
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

/// Active income/expense color scheme, kept in local prefs so the choice
/// survives restart.
// shortcut: device-only; the API keeps the colours on the user
// (`PUT /v1/auth/me/colors`, UI-12), wired with the style screen in M2 (OEW-086).
class TransactionColorSchemeController
    extends Notifier<TransactionColorScheme> {
  @override
  TransactionColorScheme build() =>
      ref.read(preferencesServiceProvider).readTransactionColorScheme();

  Future<void> set(TransactionColorScheme scheme) async {
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

/// The old app's per-workspace transaction settings. The new API has no such
/// resource (the settings screen was dropped with it), so the screens run on
/// the old defaults: month starts on the 1st, week on Monday, daily tab first.
final transactionSettingsProvider = Provider<AsyncValue<TransactionSettings>>(
  (ref) => AsyncData(TransactionSettings.defaults()),
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

/// Single source of truth for "is the user signed in, and where". The router
/// redirect listens to this; a refused refresh calls [signedOut].
class SessionController extends Notifier<AsyncValue<Session?>> {
  @override
  AsyncValue<Session?> build() {
    _bootstrap();
    return const AsyncValue.loading();
  }

  Future<void> _bootstrap() async {
    final session = await ref.read(authRepositoryProvider).currentSession();
    if (session == null) {
      state = const AsyncValue.data(null);
      return;
    }
    // A failed check keeps the stored session: the router still has
    // somewhere to send it, and the next call retries.
    await enter(session);
  }

  @visibleForTesting
  void setForTest(Session? session) => state = AsyncValue.data(session);

  /// Runs the `/sync` check (D109) on a fresh session and makes it current.
  /// Returns the error to show, or null.
  Future<AppError?> enter(Session session) async {
    final synced = await syncWorkspace(
      session,
      auth: ref.read(authRepositoryProvider),
      workspaces: ref.read(workspacesRepositoryProvider),
    );
    switch (synced) {
      case Success(:final value):
        state = AsyncValue.data(value);
        return null;
      case Failure(:final error):
        state = AsyncValue.data(session);
        return error;
    }
  }

  /// Re-scope the session to another workspace (WS-2).
  Future<AppError?> switchTo(String workspaceId) async {
    final res = await ref
        .read(authRepositoryProvider)
        .switchWorkspace(workspaceId);
    switch (res) {
      case Success(:final value):
        state = AsyncValue.data(value);
        ref
          ..read(transactionsRevisionProvider.notifier).bump()
          ..read(walletsRevisionProvider.notifier).bump()
          ..read(budgetsRevisionProvider.notifier).bump();
        return null;
      case Failure(:final error):
        return error;
    }
  }

  Future<void> clear() async {
    await ref.read(authRepositoryProvider).logout();
    state = const AsyncValue.data(null);
  }

  /// The tokens are already gone (a refused refresh).
  void signedOut() => state = const AsyncValue.data(null);
}

final sessionControllerProvider =
    NotifierProvider<SessionController, AsyncValue<Session?>>(
      SessionController.new,
    );

/// Whether the current role may write (MOB-5). A member sees no control that
/// writes; the API refuses the write either way.
final canWriteProvider = Provider<bool>(
  (ref) => ref.watch(
    sessionControllerProvider.select((s) => s.valueOrNull?.canWrite ?? false),
  ),
);
