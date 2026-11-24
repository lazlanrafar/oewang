import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';
import 'package:oewang/domain/models/money.dart';

/// One budget line of `GET /v1/budgets`. Every figure is the API's (D27).
@immutable
class BudgetStatus extends Equatable {
  const BudgetStatus({
    required this.id,
    required this.categoryId,
    required this.categoryName,
    required this.amount,
    required this.spent,
    required this.remaining,
    required this.percentage,
  });

  final String id;
  final String categoryId;
  final String categoryName;
  final Money amount;
  final Money spent;

  /// Negative once the budget is over.
  final Money remaining;

  /// Whole percent of the limit, past 100 when over.
  final int percentage;

  @override
  List<Object?> get props => [
    id,
    categoryId,
    categoryName,
    amount,
    spent,
    remaining,
    percentage,
  ];
}

/// The month's totals over every budget, as `GET /v1/budgets` states them.
@immutable
class BudgetTotals {
  const BudgetTotals({
    required this.totalBudget,
    required this.totalSpent,
    required this.remaining,
    required this.percent,
  });

  factory BudgetTotals.zero() => BudgetTotals(
    totalBudget: Money.zero(),
    totalSpent: Money.zero(),
    remaining: Money.zero(),
    percent: 0,
  );

  final Money totalBudget;
  final Money totalSpent;
  final Money remaining;

  /// Whole percent of the total budget, past 100 when over.
  final int percent;
}

/// `GET /v1/budgets?month=`: the totals and one line per budget.
@immutable
class BudgetMonth {
  const BudgetMonth({required this.totals, required this.budgets});

  factory BudgetMonth.empty() =>
      BudgetMonth(totals: BudgetTotals.zero(), budgets: const []);

  final BudgetTotals totals;
  final List<BudgetStatus> budgets;
}
