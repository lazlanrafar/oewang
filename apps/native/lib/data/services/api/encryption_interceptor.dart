import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show compute;
import 'package:oewang/data/services/api/oewang_crypto.dart';

/// Mirrors `packages/modules/src/lib/axios.server.ts`:
///
/// - Request body of POST/PUT/PATCH is AES-256-GCM encrypted and wrapped as
///   `{ data: <cipher> }` with `x-encrypted: true`.
/// - Responses carrying `x-encrypted: true` are decrypted and the `data`
///   field is replaced with the plaintext JSON.
class EncryptionInterceptor extends Interceptor {
  EncryptionInterceptor({required this.crypto});

  final OewangCrypto crypto;

  static const Set<String> _mutatingMethods = {'POST', 'PUT', 'PATCH'};

  /// Above this many characters, run AES-GCM in a worker isolate so a large
  /// payload doesn't block the UI thread. Small bodies stay inline — spawning an
  /// isolate costs more than encrypting a few hundred bytes.
  static const int _offloadThreshold = 8192;

  Future<String> _encrypt(String plaintext) =>
      plaintext.length > _offloadThreshold
          ? compute(encryptInIsolate, (crypto.secret, plaintext))
          : Future.value(crypto.encrypt(plaintext));

  Future<String> _decrypt(String cipher) =>
      cipher.length > _offloadThreshold
          ? compute(decryptInIsolate, (crypto.secret, cipher))
          : Future.value(crypto.decrypt(cipher));

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final method = options.method.toUpperCase();
    if (_mutatingMethods.contains(method) &&
        options.data != null &&
        options.data is! FormData) {
      try {
        final cipher = await _encrypt(jsonEncode(options.data));
        options.data = {'data': cipher};
        options.headers['x-encrypted'] = 'true';
      } on Exception {
        // Surface unencrypted on local failure rather than dropping the call.
      }
    }
    handler.next(options);
  }

  @override
  Future<void> onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) async {
    final flag = response.headers.value('x-encrypted');
    if (flag == 'true') {
      final body = response.data;
      if (body is Map<String, dynamic>) {
        final cipher = body['data'];
        if (cipher is String) {
          try {
            final plain = await _decrypt(cipher);
            response.data = jsonDecode(plain);
          } on Exception {
            // Surface decoded body unchanged; downstream maps to AppError.
          }
        }
      }
    }
    handler.next(response);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final response = err.response;
    if (response != null && response.headers.value('x-encrypted') == 'true') {
      final body = response.data;
      if (body is Map<String, dynamic>) {
        final cipher = body['data'];
        if (cipher is String) {
          try {
            final plain = await _decrypt(cipher);
            response.data = jsonDecode(plain);
          } on Exception {/* fall through */}
        }
      }
    }
    handler.next(err);
  }
}
