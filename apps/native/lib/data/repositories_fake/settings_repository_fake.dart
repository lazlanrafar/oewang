import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/data/repositories/settings_repository.dart';
import 'package:oewang/domain/models/transaction_settings.dart';

class SettingsRepositoryFake implements SettingsRepository {
  SettingsRepositoryFake({
    TransactionColorScheme initial = TransactionColorScheme.blueRed,
  }) : _scheme = initial;

  TransactionColorScheme _scheme;

  TransactionColorScheme get scheme => _scheme;

  @override
  Future<Result<TransactionSettings, AppError>>
  fetchTransactionSettings() async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    return Success(
      TransactionSettings.defaults().copyWith(incomeExpensesColor: _scheme),
    );
  }

  @override
  Future<Result<TransactionSettings, AppError>> updateTransactionSettings(
    Map<String, Object?> changes,
  ) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    final color = changes['incomeExpensesColor'];
    if (color is String) _scheme = TransactionColorScheme.fromSetting(color);
    return fetchTransactionSettings();
  }

  @override
  Future<Result<TransactionSettings, AppError>> updateColorScheme(
    TransactionColorScheme scheme,
  ) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    _scheme = scheme;
    return fetchTransactionSettings();
  }
}
