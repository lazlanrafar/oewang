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
      final me = envelopeData(await _api.get('/auth/me'));
      final rows = envelopeData(await _api.get('/workspaces'));
      return Success(
        UserProfileDto.fromMe(me! as Map<String, dynamic>, [
          for (final row in (rows as List?) ?? const [])
            WorkspaceMembershipDto.fromJson(row as Map<String, dynamic>),
        ]).toDomain(),
      );
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  @override
  Future<Result<UserProfile, AppError>> updateProfile({
    String? name,
    String? mobile,
  }) async {
    try {
      // The new API keeps a name only (AUTH-11); there is no mobile number.
      await _api.patch('/auth/me', data: {'name': name ?? ''});
      return getProfile();
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  // shortcut: avatar upload is `PUT /v1/auth/me/avatar` with base64 bytes,
  // ported with the profile screen in M2 (OEW-086).
  @override
  Future<Result<String, AppError>> uploadAvatar(File file) async =>
      const Failure(UnknownError('Changing the photo is not available yet'));

  // shortcut: the new API has no self-service erase route yet; the screen
  // keeps its button and says so. Revisit with the settings port (OEW-086).
  @override
  Future<Result<void, AppError>> deleteAccount() async =>
      const Failure(UnknownError('Deleting the account is not available yet'));
}
