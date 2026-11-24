import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

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

  @override
  Future<Result<String, AppError>> uploadAvatar(File file) async {
    try {
      final data = envelopeData(
        await _api.put(
          '/auth/me/avatar',
          data: {'data': base64Encode(await file.readAsBytes())},
        ),
      );
      return Success(
        (data! as Map<String, dynamic>)['profile_picture'] as String,
      );
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  @override
  Future<Result<Uint8List?, AppError>> avatar() async {
    try {
      final data = envelopeData(await _api.get('/auth/me/avatar'));
      return Success(
        base64Decode((data! as Map<String, dynamic>)['data'] as String),
      );
    } on DioException catch (e) {
      // No photo is a 404, not an error to show.
      if (e.response?.statusCode == 404) return const Success(null);
      return Failure(mapDioError(e));
    }
  }

  @override
  Future<Result<void, AppError>> updateColors({
    required String? incomeColor,
    required String? expenseColor,
  }) async {
    try {
      await _api.put(
        '/auth/me/colors',
        data: {'income_color': incomeColor, 'expense_color': expenseColor},
      );
      return const Success<void, AppError>(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  // shortcut: the API has no self-service erase route, so this refuses and
  // the screen says so. The row stays because the stores require in-app
  // account deletion; wire it when the API gains the route.
  @override
  Future<Result<void, AppError>> deleteAccount() async =>
      const Failure(UnknownError('Deleting the account is not available yet'));
}
