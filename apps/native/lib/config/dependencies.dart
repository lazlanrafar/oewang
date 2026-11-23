import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show AppLifecycleListener, ThemeMode;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/components/organisms/auth/auth_sync.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/data/repositories/auth_repository.dart';
import 'package:oewang/data/repositories/budgets_repository.dart';
import 'package:oewang/data/repositories/categories_repository.dart';
import 'package:oewang/data/repositories/chat_repository.dart';
import 'package:oewang/data/repositories/device_tokens_repository.dart';
import 'package:oewang/data/repositories/feedback_repository.dart';
import 'package:oewang/data/repositories/invites_repository.dart';
import 'package:oewang/data/repositories/overview_repository.dart';
import 'package:oewang/data/repositories/passkeys_repository.dart';
import 'package:oewang/data/repositories/rates_repository.dart';
import 'package:oewang/data/repositories/receipts_repository.dart';
import 'package:oewang/data/repositories/telegram_repository.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/repositories/users_repository.dart';
import 'package:oewang/data/repositories/vault_repository.dart';
import 'package:oewang/data/repositories/wallet_groups_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories/workspaces_repository.dart';
import 'package:oewang/data/repositories_offline/categories_repository_offline.dart';
import 'package:oewang/data/repositories_offline/transactions_repository_offline.dart';
import 'package:oewang/data/repositories_offline/wallet_groups_repository_offline.dart';
import 'package:oewang/data/repositories_offline/wallets_repository_offline.dart';
import 'package:oewang/data/repositories_remote/auth_repository_remote.dart';
import 'package:oewang/data/repositories_remote/budgets_repository_remote.dart';
import 'package:oewang/data/repositories_remote/categories_repository_remote.dart';
import 'package:oewang/data/repositories_remote/chat_repository_remote.dart';
import 'package:oewang/data/repositories_remote/device_tokens_repository_remote.dart';
import 'package:oewang/data/repositories_remote/feedback_repository_remote.dart';
import 'package:oewang/data/repositories_remote/invites_repository_remote.dart';
import 'package:oewang/data/repositories_remote/overview_repository_remote.dart';
import 'package:oewang/data/repositories_remote/passkeys_repository_remote.dart';
import 'package:oewang/data/repositories_remote/rates_repository_remote.dart';
import 'package:oewang/data/repositories_remote/receipts_repository_remote.dart';
import 'package:oewang/data/repositories_remote/telegram_repository_remote.dart';
import 'package:oewang/data/repositories_remote/transactions_repository_remote.dart';
import 'package:oewang/data/repositories_remote/users_repository_remote.dart';
import 'package:oewang/data/repositories_remote/vault_repository_remote.dart';
import 'package:oewang/data/repositories_remote/wallet_groups_repository_remote.dart';
import 'package:oewang/data/repositories_remote/wallets_repository_remote.dart';
import 'package:oewang/data/repositories_remote/workspaces_repository_remote.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/data/services/passkeys/passkey_authenticator.dart';
import 'package:oewang/data/services/push/push_messaging.dart';
import 'package:oewang/data/services/push/push_service.dart';
import 'package:oewang/data/services/storage/preferences_service.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';
import 'package:oewang/data/services/sync/sync_service.dart';
import 'package:oewang/domain/models/session.dart';
import 'package:oewang/domain/models/transaction_settings.dart';
import 'package:oewang/domain/models/workspace.dart';

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

final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase.open();
  ref.onDispose(db.close);
  return db;
});

/// The offline write queue (MOB-6). Replays when the connection returns,
/// when the app comes back to the foreground, and on a workspace change.
final syncServiceProvider = Provider<SyncService>((ref) {
  final sync = SyncService(
    db: ref.watch(appDatabaseProvider),
    api: ref.watch(apiClientProvider),
    workspaceId: () =>
        ref.read(sessionControllerProvider).valueOrNull?.workspaceId,
    canWrite: () => ref.read(canWriteProvider),
    onSynced: () => ref
      ..read(transactionsRevisionProvider.notifier).bump()
      ..read(walletsRevisionProvider.notifier).bump(),
  );
  void connectivity(List<ConnectivityResult> r) =>
      sync.setOnline(online: r.any((c) => c != ConnectivityResult.none));
  final net = Connectivity();
  unawaited(net.checkConnectivity().then(connectivity));
  final sub = net.onConnectivityChanged.listen(connectivity);
  final lifecycle = AppLifecycleListener(
    onResume: () => unawaited(sync.drain()),
  );
  ref
    ..listen(sessionControllerProvider, (_, _) => unawaited(sync.drain()))
    ..onDispose(() {
      unawaited(sub.cancel());
      lifecycle.dispose();
      sync.dispose();
    });
  return sync;
});

/// What the sync banner shows, updated as the queue moves.
final syncStatusProvider = Provider<SyncStatus>((ref) {
  final status = ref.watch(syncServiceProvider).status;
  void changed() => ref.invalidateSelf();
  status.addListener(changed);
  ref.onDispose(() => status.removeListener(changed));
  return status.value;
});

final chatRepositoryProvider = Provider<ChatRepository>((ref) {
  return ChatRepositoryRemote(ref.watch(apiClientProvider));
});

final receiptsRepositoryProvider = Provider<ReceiptsRepository>((ref) {
  return ReceiptsRepositoryRemote(ref.watch(apiClientProvider));
});

final transactionsRepositoryProvider = Provider<TransactionsRepository>((ref) {
  final api = ref.watch(apiClientProvider);
  return TransactionsRepositoryOffline(
    remote: TransactionsRepositoryRemote(api),
    api: api,
    sync: ref.watch(syncServiceProvider),
  );
});

final overviewRepositoryProvider = Provider<OverviewRepository>((ref) {
  return OverviewRepositoryRemote(ref.watch(apiClientProvider));
});

final walletsRepositoryProvider = Provider<WalletsRepository>((ref) {
  final api = ref.watch(apiClientProvider);
  return WalletsRepositoryOffline(
    remote: WalletsRepositoryRemote(api),
    api: api,
    sync: ref.watch(syncServiceProvider),
  );
});

final walletGroupsRepositoryProvider = Provider<WalletGroupsRepository>((ref) {
  final api = ref.watch(apiClientProvider);
  return WalletGroupsRepositoryOffline(
    remote: WalletGroupsRepositoryRemote(api),
    api: api,
    sync: ref.watch(syncServiceProvider),
  );
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
  final api = ref.watch(apiClientProvider);
  return CategoriesRepositoryOffline(
    remote: CategoriesRepositoryRemote(api),
    api: api,
    sync: ref.watch(syncServiceProvider),
  );
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

final invitesRepositoryProvider = Provider<InvitesRepository>((ref) {
  return InvitesRepositoryRemote(ref.watch(apiClientProvider));
});

final telegramRepositoryProvider = Provider<TelegramRepository>((ref) {
  return TelegramRepositoryRemote(ref.watch(apiClientProvider));
});

final passkeysRepositoryProvider = Provider<PasskeysRepository>((ref) {
  return PasskeysRepositoryRemote(
    api: ref.watch(apiClientProvider),
    storage: ref.watch(secureStorageProvider),
  );
});

final devicePasskeysProvider = Provider<DevicePasskeys>(
  (ref) => DevicePasskeys(),
);

final deviceTokensRepositoryProvider = Provider<DeviceTokensRepository>((ref) {
  return DeviceTokensRepositoryRemote(ref.watch(apiClientProvider));
});

final pushMessagingProvider = Provider<PushMessaging>(
  (ref) => FirebasePushMessaging(),
);

/// Push (PUSH-1, D116): the session controller tells it every change, so it
/// registers this device; the app widget starts it, so a tapped push opens
/// its screen.
final pushServiceProvider = Provider<PushService>((ref) {
  final service = PushService(
    messaging: ref.watch(pushMessagingProvider),
    deviceTokens: ref.watch(deviceTokensRepositoryProvider),
    open: (location) => ref.read(appRouterProvider).go(location),
  );
  ref.onDispose(service.dispose);
  return service;
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

/// Active income/expense color scheme. The API keeps it on the user
/// (`PUT /v1/auth/me/colors`, UI-9); local prefs only paint the first frame
/// before `/v1/auth/me` answers, and after a sign-in it is read again.
class TransactionColorSchemeController
    extends Notifier<TransactionColorScheme> {
  @override
  TransactionColorScheme build() {
    final userId = ref.watch(
      sessionControllerProvider.select((s) => s.valueOrNull?.userId),
    );
    if (userId != null) unawaited(_pull());
    return ref.read(preferencesServiceProvider).readTransactionColorScheme();
  }

  Future<void> _pull() async {
    final res = await ref.read(usersRepositoryProvider).getProfile();
    if (res case Success(:final value)) {
      await _apply(TransactionColorScheme.fromApi(value.incomeColor));
    }
  }

  Future<void> _apply(TransactionColorScheme scheme) async {
    state = scheme;
    await ref
        .read(preferencesServiceProvider)
        .writeTransactionColorScheme(scheme);
  }

  /// Saves [scheme] on the user. Returns the error, after putting the old
  /// scheme back, or null.
  Future<AppError?> set(TransactionColorScheme scheme) async {
    final before = state;
    await _apply(scheme);
    final colors = scheme.apiColors;
    final res = await ref
        .read(usersRepositoryProvider)
        .updateColors(incomeColor: colors.income, expenseColor: colors.expense);
    if (res case Failure(:final error)) {
      await _apply(before);
      return error;
    }
    return null;
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
    // Every way into a workspace (sign-in, create, join, switch) registers
    // the device for push again; the route needs that workspace session.
    listenSelf(
      (_, next) => unawaited(
        ref.read(pushServiceProvider).sessionChanged(next.valueOrNull),
      ),
    );
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
    // While the tokens still work: the route needs this session.
    await ref.read(pushServiceProvider).signingOut();
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

/// Whether the current role is `owner`: the workspace currency is theirs
/// alone to change (WAL-7).
final isOwnerProvider = Provider<bool>(
  (ref) => ref.watch(
    sessionControllerProvider.select((s) => s.valueOrNull?.role == 'owner'),
  ),
);

/// `GET /v1/workspaces/current`: the base currency every total is in, and
/// whether it is locked. Refetched when the session changes workspace;
/// invalidate it after changing the currency.
final currentWorkspaceProvider = FutureProvider.autoDispose<Workspace?>((
  ref,
) async {
  final id = ref.watch(
    sessionControllerProvider.select((s) => s.valueOrNull?.workspaceId),
  );
  if (id == null) return null;
  final res = await ref.watch(workspacesRepositoryProvider).current();
  return res.fold((w) => w, (_) => null);
});
