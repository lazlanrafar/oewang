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
}
