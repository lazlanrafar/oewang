import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The access and refresh tokens, in the platform keystore only (MOB-2).
/// Never in shared preferences, a file or a log.
class SecureStorageService {
  SecureStorageService({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.first_unlock,
            ),
          );

  final FlutterSecureStorage _storage;

  static const _access = 'oewang.access_token';
  static const _refresh = 'oewang.refresh_token';

  Future<String?> readAccessToken() => _storage.read(key: _access);

  Future<String?> readRefreshToken() => _storage.read(key: _refresh);

  /// Both together: a refresh rotates the pair, and an old refresh token
  /// used again revokes the whole family (AUTH-9).
  Future<void> writeTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _storage.write(key: _access, value: accessToken);
    await _storage.write(key: _refresh, value: refreshToken);
  }

  Future<void> clear() async {
    await _storage.delete(key: _access);
    await _storage.delete(key: _refresh);
  }
}
