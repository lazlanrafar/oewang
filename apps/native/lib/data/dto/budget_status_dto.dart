import 'package:decimal/decimal.dart';
import 'package:oewang/domain/models/budget_status.dart';
import 'package:oewang/domain/models/money.dart';

/// `GET /v1/budgets` (`BudgetStatus` in the API): totals plus one line per
/// budget. Money fields are decimal strings, never parsed through a double
/// (D12); a malformed one throws, because it is a wire bug and not a zero.
abstract final class BudgetMonthDto {
  static BudgetMonth fromJson(Map<String, dynamic> json) {
    final currency = json['currency_code'] as String;
    Money money(Map<String, dynamic> m, String key) =>
        Money(amount: Decimal.parse(m[key] as String), currency: currency);

    return BudgetMonth(
      totals: BudgetTotals(
        totalBudget: money(json, 'budgeted'),
        totalSpent: money(json, 'spent'),
        remaining: money(json, 'remaining'),
        percent: (json['percent'] as num).toInt(),
      ),
      budgets: [
        for (final row in json['budgets'] as List)
          BudgetStatus(
            id: (row as Map<String, dynamic>)['id'] as String,
            categoryId: row['category_id'] as String,
            categoryName: row['category_name'] as String? ?? '',
            amount: money(row, 'amount'),
            spent: money(row, 'spent'),
            remaining: money(row, 'remaining'),
            percentage: (row['percent'] as num).toInt(),
          ),
      ],
    );
  }
}
