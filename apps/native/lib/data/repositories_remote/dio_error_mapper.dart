import 'package:dio/dio.dart';
import 'package:oewang/core/logging/app_logger.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/data/services/api/owe1/owe1_protocol.dart';

final _log = createLogger('api');

/// An operator shut this account or workspace out (D127). The API's own
/// message is written for developers; these are what a person reads.
const _shutOut = {
  'USER_DISABLED': 'This account is disabled. Contact Oewang support.',
  'WORKSPACE_SUSPENDED':
      'This workspace is suspended by Oewang. Its data is kept. Switch to '
      'another workspace in More, or contact Oewang support.',
};

/// Single conversion from [DioException] to [AppError], reading the API's
/// envelope (docs/api/conventions.md#the-envelope).
AppError mapDioError(DioException e) {
  final status = e.response?.statusCode;
  final body = e.response?.data;
  final error = body is Map ? body['error'] : null;
  final code = error is Map ? error['code'] as String? : null;
  final message =
      _shutOut[code] ??
      (error is Map ? error['message'] as String? : null) ??
      'Something went wrong';
  // Never the body: it is a decrypted payload (OPS-3).
  _log.warn('request failed', {
    'method': e.requestOptions.method,
    'path': e.requestOptions.path,
    'status': status,
    'code': code,
    'type': e.type.name,
  });

  if (e.error is Owe1Exception) {
    return ServerError(
      statusCode: status ?? 0,
      code: 'TRANSPORT_UNEXPECTED_RESPONSE',
      message: 'Could not open a secure connection',
    );
  }
  if (e.type == DioExceptionType.connectionError ||
      e.type == DioExceptionType.connectionTimeout ||
      e.type == DioExceptionType.receiveTimeout ||
      e.type == DioExceptionType.sendTimeout) {
    return const NetworkError();
  }
  if (status == 401) return UnauthorizedError(message, code);
  final fields = error is Map ? error['fields'] : null;
  if (fields is Map && fields.isNotEmpty) {
    final map = fields.map((k, v) => MapEntry('$k', '$v'));
    return ValidationError(
      field: map.keys.first,
      message: map.values.first,
      fields: map,
    );
  }
  if (status != null && status >= 400) {
    return ServerError(statusCode: status, message: message, code: code);
  }
  return UnknownError(message);
}
