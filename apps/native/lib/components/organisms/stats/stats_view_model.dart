import 'package:flutter/foundation.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/overview.dart';
import 'package:oewang/domain/models/transaction.dart';

/// Single slice rendered by [StatsScreen]: emoji + category + amount + %.
@immutable
class StatsSlice {
  const StatsSlice({
    required this.categoryId,
    required this.label,
    required this.amount,
    required this.percent,
  });

  final String? categoryId;
  final String label;
  final Money amount;

  /// 0–100 (capped at 100).
  final double percent;
}

/// The API's category breakdown as chart slices, in the API's order (largest
/// first, "Other" last). Every amount and share is the API's (D27).
List<StatsSlice> slicesFrom(List<CategoryShare> shares) => [
  for (final c in shares)
    StatsSlice(
      categoryId: c.id,
      label: c.label,
      amount: c.total,
      // A share for drawing the chart, not money: a double is fine here.
      percent: (c.sharePercent?.toDouble() ?? 0).clamp(0, 100).toDouble(),
    ),
];

/// One row of the Note tab: a note (transaction name), how many transactions
/// carry it, and their summed amount.
@immutable
class NoteRow {
  const NoteRow({
    required this.label,
    required this.count,
    required this.amount,
  });

  final String label;
  final int count;
  final Money amount;
}

/// Aggregates a period's transactions by their note (`name`) for one mode.
/// Transactions with no note collapse into a single blank-label row (mirrors
/// the WMoney Note tab). Sorted by count desc, then amount desc.
///
/// Sums each row's `base_amount`, the workspace-currency figure the API
/// stored at write time and sums itself, so two currencies never add up.
// shortcut: the API has no per-note total, so this adds the rows' decimals
// as the old screen did; a `group=name` summary would replace it.
List<NoteRow> aggregateNotes({
  required List<Transaction> transactions,
  required bool incomeMode,
  required String currency,
}) {
  final byNote = <String, ({int count, Money amount})>{};
  for (final t in transactions) {
    final matches = incomeMode ? t.isIncome : t.isExpense;
    if (!matches) continue;
    final key = (t.name ?? '').trim();
    final prev =
        byNote[key] ?? (count: 0, amount: Money.zero(currency: currency));
    byNote[key] = (
      count: prev.count + 1,
      amount: prev.amount + Money(amount: t.baseAmount, currency: currency),
    );
  }

  final rows =
      byNote.entries
          .map(
            (e) => NoteRow(
              label: e.key,
              count: e.value.count,
              amount: e.value.amount,
            ),
          )
          .toList()
        ..sort((a, b) {
          final byCount = b.count.compareTo(a.count);
          return byCount != 0
              ? byCount
              : b.amount.amount.compareTo(a.amount.amount);
        });
  return rows;
}
