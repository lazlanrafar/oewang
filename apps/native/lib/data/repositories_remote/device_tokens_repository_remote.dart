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
  }) => _send(
    () => _api.post(
      '/device-tokens',
      data: {'token': token, 'platform': platform},
    ),
  );

  @override
  Future<Result<void, AppError>> unregister(String token) =>
      _send(() => _api.delete('/device-tokens', data: {'token': token}));

  Future<Result<void, AppError>> _send(
    Future<Response<dynamic>> Function() call,
  ) async {
    try {
      await call();
      return const Success(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }
}
