import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/device_tokens_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';

class DeviceTokensRepositoryRemote implements DeviceTokensRepository {
  DeviceTokensRepositoryRemote(this._api);

  final ApiClient _api;

  @override
  Future<Result<void, AppError>> register({
    required String token,
    required String platform,
  }) async {
    try {
      await _api.post(
        '/device-tokens',
        data: {'token': token, 'platform': platform},
      );
      return const Success(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }
}
