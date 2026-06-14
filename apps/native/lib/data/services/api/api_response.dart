/// Mirror of `packages/types` `ApiResponse<T>` — `{ success, code, message, data }`.
class ApiResponse<T> {
  const ApiResponse({
    required this.success,
    required this.code,
    required this.message,
    this.data,
  });

  factory ApiResponse.fromJson(
    Map<String, dynamic> json,
    T Function(Object? data)? parseData,
  ) {
    final raw = json['data'];
    return ApiResponse<T>(
      success: json['success'] as bool? ?? false,
      code: json['code'] as String? ?? 'UNKNOWN',
      message: json['message'] as String? ?? '',
      data: parseData == null ? raw as T? : (raw == null ? null : parseData(raw)),
    );
  }

  final bool success;
  final String code;
  final String message;
  final T? data;
}
