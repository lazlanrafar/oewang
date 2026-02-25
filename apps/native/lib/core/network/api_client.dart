import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/env.dart';
import 'aes_gcm_decryptor.dart';

class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  static const _storage = FlutterSecureStorage();
  static const _tokenKey = 'okane_app_jwt';

  late final Dio _dio;
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    _dio = Dio(
      BaseOptions(
        baseUrl: '${Env.apiBaseUrl}/v1',
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 15),
        responseType:
            ResponseType.plain, // get raw string — we decrypt manually
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    // 1. Attach JWT to every request
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await getToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
      ),
    );

    // 2. Decrypt + parse every response
    // We use ResponseType.plain so Dio gives us the raw String.
    // We then decrypt if x-encrypted: true, then JSON-decode.
    _dio.interceptors.add(
      InterceptorsWrapper(
        onResponse: (response, handler) {
          try {
            final rawBody = response.data as String? ?? '';
            final isEncrypted = response.headers.value('x-encrypted') == 'true';

            if (isEncrypted) {
              // Body is: {"data":"iv_hex:ciphertext_hex:tag_hex"}
              final wrapper = jsonDecode(rawBody) as Map<String, dynamic>;
              final encryptedStr = wrapper['data'] as String;
              final decryptedJson = AesGcmDecryptor.decrypt(
                encryptedStr,
                Env.encryptionKey,
              );
              response.data = jsonDecode(decryptedJson);
            } else {
              response.data = rawBody.isNotEmpty ? jsonDecode(rawBody) : null;
            }
          } catch (e) {
            // ignore: avoid_print
            print('[ApiClient] Response processing failed: $e');
            // Leave response.data as-is (raw string) on error
          }
          handler.next(response);
        },
        onError: (error, handler) {
          try {
            final rawBody = error.response?.data as String? ?? '';
            final isEncrypted =
                error.response?.headers.value('x-encrypted') == 'true';

            if (isEncrypted && rawBody.isNotEmpty) {
              final wrapper = jsonDecode(rawBody) as Map<String, dynamic>;
              final encryptedStr = wrapper['data'] as String;
              final decryptedJson = AesGcmDecryptor.decrypt(
                encryptedStr,
                Env.encryptionKey,
              );
              error.response!.data = jsonDecode(decryptedJson);
            } else if (rawBody.isNotEmpty) {
              error.response!.data = jsonDecode(rawBody);
            }
          } catch (_) {
            // Pass through on error
          }
          handler.next(error);
        },
      ),
    );
  }

  Dio get dio {
    assert(
      _initialized,
      'ApiClient.init() must be called before accessing dio',
    );
    return _dio;
  }

  Future<String?> getToken() => _storage.read(key: _tokenKey);
  Future<void> setToken(String token) =>
      _storage.write(key: _tokenKey, value: token);
  Future<void> clearToken() => _storage.delete(key: _tokenKey);
}
