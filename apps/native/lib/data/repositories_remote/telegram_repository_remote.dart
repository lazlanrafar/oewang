import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/telegram_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';

class TelegramRepositoryRemote implements TelegramRepository {
  TelegramRepositoryRemote(this._api);

  final ApiClient _api;

  @override
  Future<Result<TelegramStatus, AppError>> status() async {
    try {
      final data = envelopeData(await _api.get('/integrations/telegram'));
      return data is Map<String, dynamic>
          ? Success(TelegramStatus.fromJson(data))
          : const Failure(UnknownError('Unexpected Telegram response'));
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  @override
  Future<Result<Uri, AppError>> linkToken() async {
    try {
      final data = envelopeData(
        await _api.post('/integrations/telegram/link-token'),
      );
      final link = data is Map ? data['deep_link'] : null;
      final uri = link is String ? Uri.tryParse(link) : null;
      return uri != null
          ? Success(uri)
          : const Failure(UnknownError('Unexpected Telegram response'));
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  @override
  Future<Result<void, AppError>> unlink() async {
    try {
      await _api.post('/integrations/telegram/unlink');
      return const Success(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }
}
