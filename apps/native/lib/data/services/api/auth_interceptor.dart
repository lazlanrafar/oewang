import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:oewang/core/logging/app_logger.dart';
import 'package:oewang/data/services/api/owe1/owe1_interceptor.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';

final _log = createLogger('auth');

/// `Authorization: Bearer <access>` on every request (MOB-2).
///
/// On `401 UNAUTHENTICATED` it calls `/v1/auth/refresh` once with the stored
/// refresh token, stores the rotated pair and retries the request. A refresh
/// the API refuses signs out. Concurrent 401s share one refresh: two refreshes
/// with the same token would look like reuse and revoke the family (AUTH-9).
class AuthInterceptor extends Interceptor {
  AuthInterceptor({required this.storage, required this.dio, this.onSignedOut});

  final SecureStorageService storage;

  /// The Dio this interceptor is on, for the refresh call and the retry.
  final Dio dio;

  /// Called after a refused refresh, with the tokens already cleared.
  final Future<void> Function()? onSignedOut;

  /// Set on a request that must go out without the bearer and must never
  /// trigger a refresh (the refresh call itself).
  static const skip = 'auth.skip';

  /// The workspace a queued write belongs to. The request is cancelled
  /// before it leaves when the stored token is for another workspace, so a
  /// switch during a replay cannot send one workspace's write with the
  /// other's token. A cancel is transient to the sync queue: it stays queued.
  static const workspace = 'auth.workspace';
  static const _retried = 'auth.retried';

  Future<_Refresh>? _inflight;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    options.headers.remove('Authorization');
    if (options.extra[skip] != true) {
      final token = await storage.readAccessToken();
      if (token != null && token.isNotEmpty) {
        final expected = options.extra[workspace];
        final wid = decodeJwtClaims(token)['wid'];
        if (expected is String && wid is String && wid != expected) {
          return handler.reject(
            DioException(
              requestOptions: options,
              type: DioExceptionType.cancel,
              message: 'the session moved to another workspace',
            ),
          );
        }
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
    final options = err.requestOptions;
    final sent = options.headers['Authorization'];
    if (err.response?.statusCode != 401 ||
        errorCode(err.response?.data) != 'UNAUTHENTICATED' ||
        sent == null ||
        options.extra[skip] == true ||
        options.extra[_retried] == true) {
      return handler.next(err);
    }

    switch (await _refreshFor(sent as String)) {
      case _Refresh.done:
        options.extra[_retried] = true;
        try {
          handler.resolve(await dio.fetch<dynamic>(options));
        } on DioException catch (e) {
          handler.reject(e);
        }
      case _Refresh.refused:
        _log.warn('refresh refused, signing out');
        await storage.clear();
        await onSignedOut?.call();
        handler.next(err);
      case _Refresh.unreachable:
        // No answer is not a refusal: keep the tokens, surface the 401.
        handler.next(err);
    }
  }

  Future<_Refresh> _refreshFor(String sent) async {
    // Another request already rotated the pair while this one was in flight.
    final current = await storage.readAccessToken();
    if (current != null && 'Bearer $current' != sent) return _Refresh.done;
    return _inflight ??= _refresh().whenComplete(() => _inflight = null);
  }

  Future<_Refresh> _refresh() async {
    final refreshToken = await storage.readRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) return _Refresh.refused;
    try {
      final res = await dio.post<dynamic>(
        '/auth/refresh',
        data: {'refresh_token': refreshToken},
        options: Options(extra: {skip: true}),
      );
      final data = (res.data as Map<String, dynamic>)['data'] as Map;
      await storage.writeTokens(
        accessToken: data['access_token'] as String,
        refreshToken: data['refresh_token'] as String,
      );
      return _Refresh.done;
    } on DioException catch (e) {
      // A rate limit or an outage is not a refusal of the token.
      final status = e.response?.statusCode;
      return status == 400 || status == 401 || status == 403
          ? _Refresh.refused
          : _Refresh.unreachable;
    }
  }
}

enum _Refresh { done, refused, unreachable }

/// The payload of a JWT, unverified. Empty when it is not one.
Map<String, dynamic> decodeJwtClaims(String token) {
  try {
    final parts = token.split('.');
    if (parts.length != 3) return const {};
    final decoded = jsonDecode(
      utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
    );
    return decoded is Map<String, dynamic> ? decoded : const {};
  } on FormatException {
    return const {};
  }
}
