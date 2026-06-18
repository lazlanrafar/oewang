import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:oewang/config/env.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/login_response_dto.dart';
import 'package:oewang/data/repositories/auth_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
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
  Future<Result<Session, AppError>> register({
    required String name,
    required String email,
    required String password,
  }) async {
    try {
      final res = await api.post(
        '/auth/register',
        data: {'name': name, 'email': email, 'password': password},
      );
      final body = res.data as Map<String, dynamic>;
      final success = body['success'] as bool? ?? false;
      if (!success) {
        return Failure(
          ServerError(
            statusCode: res.statusCode ?? 500,
            message: body['message'] as String? ?? 'Registration failed',
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
    // Decode the JWT payload (no signature check needed client-side) so the
    // router knows the workspace_id — a user without one is sent to onboarding.
    final claims = _decodeJwtClaims(token);
    // Drop expired tokens so a stale session doesn't strand the user on a
    // screen whose API calls will 401; falling through to login re-auths them.
    final exp = claims['exp'];
    if (exp is num &&
        DateTime.now().millisecondsSinceEpoch >= exp * 1000) {
      await storage.deleteToken(env.sessionCookieName);
      return null;
    }
    return Session(
      token: token,
      userId: claims['user_id'] as String? ?? '',
      workspaceId: claims['workspace_id'] as String?,
    );
  }

  Map<String, dynamic> _decodeJwtClaims(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return const {};
      final payload = utf8.decode(
        base64Url.decode(base64Url.normalize(parts[1])),
      );
      final decoded = jsonDecode(payload);
      return decoded is Map<String, dynamic> ? decoded : const {};
    } on Exception {
      return const {};
    }
  }

  @override
  Future<Result<Session, AppError>> refreshToken() async {
    try {
      final res = await api.post('/auth/refresh');
      final body = res.data as Map<String, dynamic>;
      final data = body['data'];
      if (data is! Map<String, dynamic>) {
        return const Failure(
          ServerError(statusCode: 500, message: 'Unexpected refresh response'),
        );
      }
      final dto = LoginResponseDto.fromJson(data);
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
  Future<void> logout() => storage.deleteToken(env.sessionCookieName);

  AppError _mapDioError(DioException e) => mapDioError(e);
}
