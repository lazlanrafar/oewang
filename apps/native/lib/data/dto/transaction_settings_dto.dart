import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/domain/models/transaction_settings.dart';

class TransactionSettingsDto {
  const TransactionSettingsDto({required this.incomeExpensesColor});

  factory TransactionSettingsDto.fromJson(Map<String, dynamic> json) {
    final raw = (json['incomeExpensesColor'] ?? json['income_expenses_color'])
        as String?;
    return TransactionSettingsDto(incomeExpensesColor: raw);
  }

  final String? incomeExpensesColor;

  TransactionSettings toDomain() => TransactionSettings(
    incomeExpensesColor: TransactionColorScheme.fromSetting(
      incomeExpensesColor,
    ),
  );
}
