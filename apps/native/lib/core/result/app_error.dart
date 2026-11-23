/// Sealed app-level error. Repositories return [Result<T, AppError>] — never
/// throw DioException — so ViewModels handle each case explicitly.
///
/// [code] is the API's stable error code (docs/api/conventions.md#error-catalog)
/// when the API gave one; it is what callers branch on, never [message].
sealed class AppError implements Exception {
  const AppError(this.message, {this.code});
  final String message;
  final String? code;

  /// What an error state shows when a screen prints the error it caught.
  @override
  String toString() => message;
}

class NetworkError extends AppError {
  const NetworkError([super.message = 'Network error']);
}

class UnauthorizedError extends AppError {
  const UnauthorizedError([super.message = 'Unauthorized', String? code])
    : super(code: code);
}

class ValidationError extends AppError {
  const ValidationError({
    required this.field,
    required String message,
    this.fields = const {},
  }) : super(message, code: 'VALIDATION_FAILED');
  final String field;

  /// Every field the API refused, field name to message.
  final Map<String, String> fields;
}

class ServerError extends AppError {
  const ServerError({
    required this.statusCode,
    required String message,
    String? code,
  }) : super(message, code: code);
  final int statusCode;
}

class UnknownError extends AppError {
  const UnknownError([super.message = 'Unknown error']);
}
