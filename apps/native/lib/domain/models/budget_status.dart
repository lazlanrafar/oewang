import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';
import 'package:oewang/domain/models/money.dart';

/// One row of the `GET /v1/budgets/status` response.
@immutable
class BudgetStatus extends Equatable {
  const BudgetStatus({
    required this.id,
    required this.categoryId,
    required this.categoryName,
    required this.amount,
    required this.spent,
    required this.percentage,
  });

  final String id;
  final String categoryId;
  final String categoryName;
  final Money amount;
  final Money spent;

  /// 0-100 (the API already clamps).
  final int percentage;

  Money get remaining => amount - spent;

  @override
  List<Object?> get props => [
    id,
    categoryId,
    categoryName,
    amount,
    spent,
    percentage,
  ];
}

/// Rolled-up totals shown in the Summary tab's Budget card (IMG_1829).
@immutable
class BudgetTotals {
  const BudgetTotals({
    required this.totalBudget,
    required this.totalSpent,
  });

  factory BudgetTotals.zero() => BudgetTotals(
    totalBudget: Money.zero(),
    totalSpent: Money.zero(),
  );

  factory BudgetTotals.fromStatuses(List<BudgetStatus> statuses) {
    var budget = Money.zero();
    var spent = Money.zero();
    for (final s in statuses) {
      budget += s.amount;
      spent += s.spent;
    }
    return BudgetTotals(totalBudget: budget, totalSpent: spent);
  }

  final Money totalBudget;
  final Money totalSpent;

  /// 0–100. Zero when there's no budget.
  int get percent {
    if (totalBudget.amount <= 0) return 0;
    final raw = (totalSpent.amount / totalBudget.amount) * 100;
    if (raw < 0) return 0;
    if (raw > 100) return 100;
    return raw.round();
  }
}
