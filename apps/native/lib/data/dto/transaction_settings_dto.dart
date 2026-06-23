import 'package:oewang/core/theme/oewang_colors.dart';
import 'package:oewang/domain/models/transaction_settings.dart';

/// Parses `/v1/settings/transaction` payloads. The API serializes camelCase;
/// snake_case fallbacks are kept for safety. Missing fields fall back to the
/// schema defaults via [TransactionSettings.defaults].
class TransactionSettingsDto {
  const TransactionSettingsDto(this._json);

  factory TransactionSettingsDto.fromJson(Map<String, dynamic> json) =>
      TransactionSettingsDto(json);

  final Map<String, dynamic> _json;

  T? _pick<T>(String camel, String snake) {
    final v = _json[camel] ?? _json[snake];
    return v is T ? v : null;
  }

  TransactionSettings toDomain() {
    final d = TransactionSettings.defaults();
    return TransactionSettings(
      monthlyStartDate:
          _pick<num>('monthlyStartDate', 'monthly_start_date')?.toInt() ??
          d.monthlyStartDate,
      monthlyStartDateWeekendHandling:
          _pick<String>(
            'monthlyStartDateWeekendHandling',
            'monthly_start_date_weekend_handling',
          ) ??
          d.monthlyStartDateWeekendHandling,
      weeklyStartDay:
          _pick<String>('weeklyStartDay', 'weekly_start_day') ??
          d.weeklyStartDay,
      carryOver: _pick<bool>('carryOver', 'carry_over') ?? d.carryOver,
      period: _pick<String>('period', 'period') ?? d.period,
      incomeExpensesColor: TransactionColorScheme.fromSetting(
        _pick<String>('incomeExpensesColor', 'income_expenses_color'),
      ),
      autocomplete: _pick<bool>('autocomplete', 'autocomplete') ?? d.autocomplete,
      timeInput: _pick<String>('timeInput', 'time_input') ?? d.timeInput,
      startScreen: _pick<String>('startScreen', 'start_screen') ?? d.startScreen,
      swipeAction:
          _pick<String>('swipeAction', 'swipe_action') ?? d.swipeAction,
      showDescription:
          _pick<bool>('showDescription', 'show_description') ?? d.showDescription,
      inputOrder: _pick<String>('inputOrder', 'input_order') ?? d.inputOrder,
    );
  }
}
