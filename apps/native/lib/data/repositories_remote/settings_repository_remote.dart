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
      final body = res.data;
      if (body is! Map<String, dynamic>) {
        return Success(TransactionSettings.defaults());
      }
      final data = body['data'];
      if (data is! Map<String, dynamic>) {
        return Success(TransactionSettings.defaults());
      }
      return Success(TransactionSettingsDto.fromJson(data).toDomain());
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<TransactionSettings, AppError>> updateColorScheme(
    TransactionColorScheme scheme,
  ) async {
    try {
      final res = await _api.patch(
        '/settings/transaction',
        data: {'incomeExpensesColor': scheme.settingValue},
      );
      final data = (res.data as Map<String, dynamic>)['data'];
      if (data is! Map<String, dynamic>) {
        return Success(TransactionSettings(incomeExpensesColor: scheme));
      }
      return Success(TransactionSettingsDto.fromJson(data).toDomain());
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }
}
