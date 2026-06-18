import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';
import 'package:oewang/core/theme/oewang_colors.dart';

/// Workspace transaction settings backed by `/v1/settings/transaction`.
/// Field names / option values mirror `packages/database/schema/
/// workspace-settings.ts`. `noteButton` is intentionally omitted — the mobile
/// app does not surface it.
@immutable
class TransactionSettings extends Equatable {
  const TransactionSettings({
    required this.monthlyStartDate,
    required this.monthlyStartDateWeekendHandling,
    required this.weeklyStartDay,
    required this.carryOver,
    required this.period,
    required this.incomeExpensesColor,
    required this.autocomplete,
    required this.timeInput,
    required this.startScreen,
    required this.swipeAction,
    required this.showDescription,
    required this.inputOrder,
  });

  factory TransactionSettings.defaults() => const TransactionSettings(
    monthlyStartDate: 1,
    monthlyStartDateWeekendHandling: 'no-changes',
    weeklyStartDay: 'Sunday',
    carryOver: false,
    period: 'Monthly',
    incomeExpensesColor: TransactionColorScheme.blueRed,
    autocomplete: true,
    timeInput: 'None',
    startScreen: 'Daily',
    swipeAction: 'Change Date',
    showDescription: false,
    inputOrder: 'Amount',
  );

  final int monthlyStartDate;
  final String monthlyStartDateWeekendHandling;
  final String weeklyStartDay;
  final bool carryOver;
  final String period;
  final TransactionColorScheme incomeExpensesColor;
  final bool autocomplete;
  final String timeInput;
  final String startScreen;
  final String swipeAction;
  final bool showDescription;
  final String inputOrder;

  TransactionSettings copyWith({
    int? monthlyStartDate,
    String? monthlyStartDateWeekendHandling,
    String? weeklyStartDay,
    bool? carryOver,
    String? period,
    TransactionColorScheme? incomeExpensesColor,
    bool? autocomplete,
    String? timeInput,
    String? startScreen,
    String? swipeAction,
    bool? showDescription,
    String? inputOrder,
  }) => TransactionSettings(
    monthlyStartDate: monthlyStartDate ?? this.monthlyStartDate,
    monthlyStartDateWeekendHandling:
        monthlyStartDateWeekendHandling ?? this.monthlyStartDateWeekendHandling,
    weeklyStartDay: weeklyStartDay ?? this.weeklyStartDay,
    carryOver: carryOver ?? this.carryOver,
    period: period ?? this.period,
    incomeExpensesColor: incomeExpensesColor ?? this.incomeExpensesColor,
    autocomplete: autocomplete ?? this.autocomplete,
    timeInput: timeInput ?? this.timeInput,
    startScreen: startScreen ?? this.startScreen,
    swipeAction: swipeAction ?? this.swipeAction,
    showDescription: showDescription ?? this.showDescription,
    inputOrder: inputOrder ?? this.inputOrder,
  );

  @override
  List<Object?> get props => [
    monthlyStartDate,
    monthlyStartDateWeekendHandling,
    weeklyStartDay,
    carryOver,
    period,
    incomeExpensesColor,
    autocomplete,
    timeInput,
    startScreen,
    swipeAction,
    showDescription,
    inputOrder,
  ];
}
