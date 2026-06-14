import 'package:dio/dio.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/login_response_dto.dart';
import 'package:oewang/data/repositories/auth_repository.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';
import 'package:oewang/domain/models/session.dart';

class AuthRepositoryRemote implements AuthRepository {
  AuthRepositoryRemote({
    required this.api,
    required this.storage,
    required this.env,
  });

  final ApiClient api;
  final SecureStorageService storage;
  final EnvConfig env;

  @override
  Future<Result<Session, AppError>> login({
    required String email,
    required String password,
  }) async {
    try {
      final res = await api.post(
        '/auth/login',
        data: {'email': email, 'password': password},
      );
      final body = res.data as Map<String, dynamic>;
      final success = body['success'] as bool? ?? false;
      if (!success) {
        return Failure(
          ServerError(
            statusCode: res.statusCode ?? 500,
            message: body['message'] as String? ?? 'Login failed',
          ),
        );
      }
      final dto = LoginResponseDto.fromJson(
        body['data'] as Map<String, dynamic>,
      );
      final session = dto.toDomain();
      await storage.writeToken(env.sessionCookieName, session.token);
      return Success(session);
    } on DioException catch (e) {
      return Failure(_mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Session?> currentSession() async {
    final token = await storage.readToken(env.sessionCookieName);
    if (token == null || token.isEmpty) return null;
    // We don't decode the JWT in v1 — userId / workspaceId surface from
    // /auth/refresh once Milestone 3 wires it. For now, only the token presence
    // matters to the router redirect.
    return Session(token: token, userId: '');
  }

  @override
  Future<void> logout() => storage.deleteToken(env.sessionCookieName);

  AppError _mapDioError(DioException e) {
    final code = e.response?.statusCode;
    final message =
        (e.response?.data is Map<String, dynamic>
            ? (e.response?.data as Map<String, dynamic>)['message'] as String?
            : null) ??
        e.message ??
        'Network error';
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
}
