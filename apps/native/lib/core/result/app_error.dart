/// Sealed app-level error. Repositories return [Result<T, AppError>] — never
/// throw DioException — so ViewModels handle each case explicitly.
sealed class AppError {
  const AppError(this.message);
  final String message;
}

class NetworkError extends AppError {
  const NetworkError([super.message = 'Network error']);
}

class UnauthorizedError extends AppError {
  const UnauthorizedError([super.message = 'Unauthorized']);
}

class ValidationError extends AppError {
  const ValidationError({required this.field, required String message})
    : super(message);
  final String field;
}

class ServerError extends AppError {
  const ServerError({required this.statusCode, required String message})
    : super(message);
  final int statusCode;
}

class UnknownError extends AppError {
  const UnknownError([super.message = 'Unknown error']);
}
