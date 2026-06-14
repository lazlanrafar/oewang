import 'package:dio/dio.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';

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
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode == 401) {
      await storage.deleteToken(sessionKey);
      await onUnauthorized?.call();
    }
    handler.next(err);
  }
}
