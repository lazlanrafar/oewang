import 'package:dio/dio.dart';
import 'package:oewang/core/logging/app_logger.dart';
import 'package:oewang/core/result/app_error.dart';

final _log = createLogger('api');

/// Single conversion from [DioException] → [AppError] used by every remote
/// repository so the mapping logic isn't duplicated.
AppError mapDioError(DioException e) {
  final code = e.response?.statusCode;
  final raw = e.response?.data;
  final message =
      (raw is Map<String, dynamic> ? raw['message'] as String? : null) ??
      e.message ??
      'Network error';
  // ponytail: never log `raw` — responses are decrypted payloads.
  _log.warn('request failed', {
    'method': e.requestOptions.method,
    'path': e.requestOptions.path,
    'status': code,
    'type': e.type.name,
  });
  if (code == 401) return UnauthorizedError(message);
  if (e.type == DioExceptionType.connectionError ||
      e.type == DioExceptionType.connectionTimeout ||
      e.type == DioExceptionType.receiveTimeout) {
    return NetworkError(message);
  }
  if (code != null && code >= 400) {
    return ServerError(statusCode: code, message: message);
  }
  return UnknownError(message);
}
