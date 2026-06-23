import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Wraps [FlutterSecureStorage] with typed helpers. Only one secret is stored:
/// the `oewang-session` JWT (keyed by the env's `sessionCookieName`).
class SecureStorageService {
  SecureStorageService({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(encryptedSharedPreferences: true),
            iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
          );

  final FlutterSecureStorage _storage;

  Future<String?> readToken(String key) => _storage.read(key: key);

  Future<void> writeToken(String key, String value) =>
      _storage.write(key: key, value: value);

  Future<void> deleteToken(String key) => _storage.delete(key: key);
}
