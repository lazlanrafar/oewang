import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';
import 'package:oewang/core/theme/oewang_colors.dart';

/// Subset of the workspace transaction settings the mobile app currently
/// reads. More fields can land alongside their dependent screens.
@immutable
class TransactionSettings extends Equatable {
  const TransactionSettings({required this.incomeExpensesColor});

  factory TransactionSettings.defaults() => const TransactionSettings(
    incomeExpensesColor: TransactionColorScheme.blueRed,
  );

  final TransactionColorScheme incomeExpensesColor;

  @override
  List<Object?> get props => [incomeExpensesColor];
}
