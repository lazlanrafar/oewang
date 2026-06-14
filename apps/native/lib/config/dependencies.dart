import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/data/repositories/auth_repository.dart';
import 'package:oewang/data/repositories_remote/auth_repository_remote.dart';
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
