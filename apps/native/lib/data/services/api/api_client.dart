import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/core/logging/app_logger.dart';
import 'package:oewang/data/services/api/auth_interceptor.dart';
import 'package:oewang/data/services/api/owe1/owe1_interceptor.dart';
import 'package:oewang/data/services/api/owe1/owe1_protocol.dart';
import 'package:oewang/data/services/api/owe1/owe1_session.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';

final _log = createLogger('http');

/// The single Dio wrapper for the app. Only `data/services/api` and the
/// remote repositories import `dio`.
///
/// Every call is OWE1 with the bearer token; the response's `data` is the
/// opened envelope (`{data, error, meta}`), or null for a `204`.
class ApiClient {
  ApiClient(this._dio);

  factory ApiClient.build({
    required EnvConfig env,
    required SecureStorageService storage,
    Future<void> Function()? onSignedOut,
    Owe1SessionStore? sessions,
  }) {
    final dio = Dio(
      BaseOptions(
        baseUrl: '${env.apiUrl}/v1',
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 30),
      ),
    );
    dio.interceptors.addAll([
      Owe1Interceptor(
        sessions:
            sessions ??
            Owe1SessionStore(
              apiUrl: env.apiUrl,
              pinnedKeys: parsePinnedKeys(env.signingKeys),
            ),
        dio: dio,
      ),
      AuthInterceptor(storage: storage, dio: dio, onSignedOut: onSignedOut),
      if (kDebugMode) _DebugLog(),
    ]);
    return ApiClient(dio);
  }

  final Dio _dio;

  /// For tests that swap the transport for an in-memory API.
  @visibleForTesting
  Dio get dioForTest => _dio;

  Future<Response<dynamic>> get(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) => _dio.get<dynamic>(path, queryParameters: queryParameters);

  Future<Response<dynamic>> post(String path, {Object? data}) =>
      _dio.post<dynamic>(path, data: data);

  Future<Response<dynamic>> put(String path, {Object? data}) =>
      _dio.put<dynamic>(path, data: data);

  Future<Response<dynamic>> patch(String path, {Object? data}) =>
      _dio.patch<dynamic>(path, data: data);

  Future<Response<dynamic>> delete(String path) => _dio.delete<dynamic>(path);
}

/// `envelope.data` of a successful response.
Object? envelopeData(Response<dynamic> res) {
  final body = res.data;
  return body is Map ? body['data'] : null;
}

/// Method, path and status only, in debug builds only (OPS-3): never a
/// header, a token, a query or a body.
class _DebugLog extends Interceptor {
  @override
  void onResponse(Response<dynamic> response, ResponseInterceptorHandler h) {
    _log.debug(
      '${response.requestOptions.method} '
      '${response.requestOptions.path} ${response.statusCode}',
    );
    h.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler h) {
    _log.debug(
      '${err.requestOptions.method} '
      '${err.requestOptions.path} ${err.response?.statusCode}',
    );
    h.next(err);
  }
}
