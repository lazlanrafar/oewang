import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/data/dto/transaction_settings_dto.dart';
import 'package:oewang/data/repositories/settings_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/storage/preferences_service.dart';
import 'package:oewang/domain/models/transaction_settings.dart';

class SettingsRepositoryRemote implements SettingsRepository {
  SettingsRepositoryRemote(this._api, this._prefs);
  final ApiClient _api;
  final PreferencesService _prefs;

  @override
  Future<Result<TransactionSettings, AppError>>
  fetchTransactionSettings() async {
    final cached = _prefs.readTransactionSettings();
    try {
      final res = await _api.get('/settings/transaction');
      final domain = _parse(res.data);
      await _prefs.writeTransactionSettings(domain);
      return Success(domain);
    } on DioException catch (e) {
      if (cached != null) return Success(cached);
      return Failure(mapDioError(e));
    } on Exception {
      if (cached != null) return Success(cached);
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<TransactionSettings, AppError>> updateTransactionSettings(
    Map<String, Object?> changes,
  ) async {
    try {
      final res = await _api.patch('/settings/transaction', data: changes);
      final domain = _parse(res.data);
      await _prefs.writeTransactionSettings(domain);
      return Success(domain);
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
