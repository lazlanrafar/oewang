import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/login_response_dto.dart';
import 'package:oewang/data/repositories/auth_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/api/auth_interceptor.dart';
import 'package:oewang/data/services/storage/secure_storage_service.dart';
import 'package:oewang/domain/models/session.dart';

class AuthRepositoryRemote implements AuthRepository {
  AuthRepositoryRemote({required this.api, required this.storage});

  final ApiClient api;
  final SecureStorageService storage;

  @override
  Future<Result<Session, AppError>> login({
    required String email,
    required String password,
  }) => _open(
    () => api.post('/auth/login', data: {'email': email, 'password': password}),
  );

  @override
  Future<Result<Session, AppError>> register({
    required String name,
    required String email,
    required String password,
  }) => _open(
    () => api.post(
      '/auth/register',
      data: {'name': name, 'email': email, 'password': password},
    ),
  );

  @override
  Future<Result<Session, AppError>> switchWorkspace(String workspaceId) =>
      _open(
        () => api.post(
          '/auth/switch-workspace',
          data: {'workspace_id': workspaceId},
        ),
      );

  Future<Result<Session, AppError>> _open(
    Future<Response<dynamic>> Function() send,
  ) => openSession(storage, send);

  @override
  Future<Session?> currentSession() async {
    final token = await storage.readAccessToken();
    if (token == null || token.isEmpty) return null;
    // Unverified, and only to pick a page (D109): the API verifies the token
    // on every call. An expired access token is fine here; the auth
    // interceptor refreshes it on the first 401.
    final claims = decodeJwtClaims(token);
    final userId = claims['sub'];
    if (userId is! String) return null;
    return Session(
      userId: userId,
      workspaceId: claims['wid'] as String?,
      role: claims['role'] as String?,
    );
  }

  @override
  Future<void> logout() async {
    final refresh = await storage.readRefreshToken();
    if (refresh != null) {
      try {
        await api.post('/auth/logout', data: {'refresh_token': refresh});
      } on DioException {
        // Signing out on the device must not depend on the network.
      }
    }
    await storage.clear();
  }
}

/// Every auth route answers with a new pair; store it before anything else
/// can use the old one. Shared with passkey sign-in.
Future<Result<Session, AppError>> openSession(
  SecureStorageService storage,
  Future<Response<dynamic>> Function() send,
) async {
  try {
    final data = envelopeData(await send());
    if (data is! Map<String, dynamic>) {
      return const Failure(UnknownError('Unexpected session response'));
    }
    final dto = LoginResponseDto.fromJson(data);
    await storage.writeTokens(
      accessToken: dto.accessToken,
      refreshToken: dto.refreshToken,
    );
    return Success(dto.toDomain());
  } on DioException catch (e) {
    return Failure(mapDioError(e));
  }
}
