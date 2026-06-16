import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/domain/models/transaction_settings.dart';

abstract class SettingsRepository {
  Future<Result<TransactionSettings, AppError>> fetchTransactionSettings();
  Future<Result<TransactionSettings, AppError>> updateColorScheme(
    TransactionColorScheme scheme,
  );
}
