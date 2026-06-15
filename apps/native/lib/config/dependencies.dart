import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/data/repositories/auth_repository.dart';
import 'package:oewang/data/repositories/categories_repository.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/repositories/wallet_groups_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories_remote/auth_repository_remote.dart';
import 'package:oewang/data/repositories_remote/categories_repository_remote.dart';
import 'package:oewang/data/repositories_remote/transactions_repository_remote.dart';
import 'package:oewang/data/repositories_remote/wallet_groups_repository_remote.dart';
import 'package:oewang/data/repositories_remote/wallets_repository_remote.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';
import 'package:oewang/domain/models/session.dart';

/// Root env provider. Loaded once at startup by main.dart.
final envProvider = Provider<EnvConfig>((ref) {
  throw UnimplementedError('Override in ProviderScope at startup');
});

final secureStorageProvider = Provider<SecureStorageService>((ref) {
  return SecureStorageService();
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

/// Active income/expense color scheme. Defaults to the web app's `blue-red`
/// preset; will be hydrated from `/v1/settings/transaction` in a follow-up.
class TransactionColorSchemeController extends Notifier<TransactionColorScheme> {
  @override
  TransactionColorScheme build() => TransactionColorScheme.blueRed;
  // Notifier idiom: explicit method beats a generated setter so callers read
  // `ctl.set(x)` consistently with the other controllers in this file.
  // ignore: use_setters_to_change_properties
  void set(TransactionColorScheme scheme) => state = scheme;
}

final transactionColorSchemeProvider =
    NotifierProvider<TransactionColorSchemeController, TransactionColorScheme>(
      TransactionColorSchemeController.new,
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
