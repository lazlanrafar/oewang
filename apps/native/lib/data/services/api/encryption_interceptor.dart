import 'dart:convert';

import 'package:dio/dio.dart';
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

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) {
    final method = options.method.toUpperCase();
    if (_mutatingMethods.contains(method) &&
        options.data != null &&
        options.data is! FormData) {
      try {
        final cipher = crypto.encrypt(jsonEncode(options.data));
        options.data = {'data': cipher};
        options.headers['x-encrypted'] = 'true';
      } on Exception {
        // Surface unencrypted on local failure rather than dropping the call.
      }
    }
    handler.next(options);
  }

  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    final flag = response.headers.value('x-encrypted');
    if (flag == 'true') {
      final body = response.data;
      if (body is Map<String, dynamic>) {
        final cipher = body['data'];
        if (cipher is String) {
          try {
            final plain = crypto.decrypt(cipher);
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
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final response = err.response;
    if (response != null && response.headers.value('x-encrypted') == 'true') {
      final body = response.data;
      if (body is Map<String, dynamic>) {
        final cipher = body['data'];
        if (cipher is String) {
          try {
            final plain = crypto.decrypt(cipher);
            response.data = jsonDecode(plain);
          } on Exception {/* fall through */}
        }
      }
    }
    handler.next(err);
  }
}
