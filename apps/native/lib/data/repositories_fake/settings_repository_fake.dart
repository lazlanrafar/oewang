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
    return Success(TransactionSettings(incomeExpensesColor: _scheme));
  }

  @override
  Future<Result<TransactionSettings, AppError>> updateColorScheme(
    TransactionColorScheme scheme,
  ) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    _scheme = scheme;
    return Success(TransactionSettings(incomeExpensesColor: scheme));
  }
}
