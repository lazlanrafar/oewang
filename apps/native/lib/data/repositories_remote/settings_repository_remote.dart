import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/data/dto/transaction_settings_dto.dart';
import 'package:oewang/data/repositories/settings_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/transaction_settings.dart';

class SettingsRepositoryRemote implements SettingsRepository {
  SettingsRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<TransactionSettings, AppError>>
  fetchTransactionSettings() async {
    try {
      final res = await _api.get('/settings/transaction');
      return Success(_parse(res.data));
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<TransactionSettings, AppError>> updateTransactionSettings(
    Map<String, Object?> changes,
  ) async {
    try {
      final res = await _api.patch('/settings/transaction', data: changes);
      return Success(_parse(res.data));
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<TransactionSettings, AppError>> updateColorScheme(
    TransactionColorScheme scheme,
  ) => updateTransactionSettings({'incomeExpensesColor': scheme.settingValue});

  TransactionSettings _parse(Object? body) {
    if (body is! Map<String, dynamic>) return TransactionSettings.defaults();
    final data = body['data'];
    if (data is! Map<String, dynamic>) return TransactionSettings.defaults();
    return TransactionSettingsDto.fromJson(data).toDomain();
  }
}
