import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:oewang/core/logging/app_logger.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';

final _log = createLogger('auth');

/// Injects `Authorization: Bearer <jwt>` on every outgoing request when a
/// session is in secure storage. On 401 the matching response handler clears
/// the stored token so the router redirect to `/login` can fire.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this.storage,
    required this.sessionKey,
    this.onUnauthorized,
  });

  final SecureStorageService storage;
  final String sessionKey;
  final Future<void> Function()? onUnauthorized;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (options.headers['Authorization'] == null) {
      final token = await storage.readToken(sessionKey);
      if (token != null && token.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    }
    final expected = options.extra['workspaceId'];
    if (expected != null) {
      try {
        final authorization = options.headers['Authorization'];
        if (authorization is! String) throw const FormatException();
        final parts = authorization.split(' ').last.split('.');
        if (parts.length != 3) throw const FormatException();
        final payload = jsonDecode(
          utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
        );
        if (payload is! Map<String, dynamic>) throw const FormatException();
        if (payload['workspace_id'] != expected) throw const FormatException();
      } on Exception {
        handler.reject(
          DioException(
            requestOptions: options,
            type: DioExceptionType.cancel,
            message: 'Workspace changed before sync',
          ),
        );
        return;
      }
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final current = err.response?.statusCode == 401
        ? await storage.readToken(sessionKey)
        : null;
    if (err.response?.statusCode == 401 &&
        current != null &&
        err.requestOptions.headers['Authorization'] == 'Bearer $current') {
      _log.warn('401 — clearing session', {'path': err.requestOptions.path});
      await storage.deleteToken(sessionKey);
      await onUnauthorized?.call();
    }
    handler.next(err);
  }
}
