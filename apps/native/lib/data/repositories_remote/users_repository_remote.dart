import 'dart:io';

import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/user_profile_dto.dart';
import 'package:oewang/data/repositories/users_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/user_profile.dart';

class UsersRepositoryRemote implements UsersRepository {
  UsersRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<UserProfile, AppError>> getProfile() async {
    try {
      final res = await _api.get('/users/me');
      final body = res.data as Map<String, dynamic>;
      final data = body['data'];
      if (data is! Map<String, dynamic>) {
        return const Failure(
          ServerError(statusCode: 500, message: 'Unexpected profile response'),
        );
      }
      return Success(UserProfileDto.fromJson(data).toDomain());
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<UserProfile, AppError>> updateProfile({
    String? name,
    String? mobile,
  }) async {
    try {
      await _api.patch(
        '/users/me',
        data: {
          if (name != null) 'name': name,
          if (mobile != null) 'mobile': mobile,
        },
      );
      // The PATCH endpoint returns the metadata wrapper, not the new profile,
      // so re-fetch /me to get the canonical post-update state.
      return getProfile();
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<String, AppError>> uploadAvatar(File file) async {
    try {
      final form = FormData.fromMap({
        'file': await MultipartFile.fromFile(file.path, filename: _baseName(file)),
      });
      final res = await _api.post('/users/me/avatar', data: form);
      final body = res.data as Map<String, dynamic>;
      final data = body['data'];
      if (data is! Map<String, dynamic>) {
        return const Failure(
          ServerError(statusCode: 500, message: 'Unexpected avatar response'),
        );
      }
      final url = data['url'] as String?;
      if (url == null || url.isEmpty) {
        return const Failure(
          ServerError(
            statusCode: 500,
            message: 'Avatar response missing url',
          ),
        );
      }
      return Success(url);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<void, AppError>> switchWorkspace(String workspaceId) async {
    try {
      await _api.patch(
        '/users/me/workspace',
        data: {'workspaceId': workspaceId},
      );
      return const Success<void, AppError>(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  static String _baseName(File f) {
    final sep = f.path.lastIndexOf(Platform.pathSeparator);
    return sep < 0 ? f.path : f.path.substring(sep + 1);
  }
}
