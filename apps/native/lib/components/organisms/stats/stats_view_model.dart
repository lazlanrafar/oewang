import 'package:flutter/foundation.dart';
import 'package:oewang/domain/models/money.dart';
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

/// Aggregates a month's transactions into per-category slices for one mode
/// (income or expense). Pure function; the screen drives the input itself.
List<StatsSlice> aggregateStats({
  required List<Transaction> transactions,
  required bool incomeMode,
}) {
  final byCategory = <String?, ({String label, Money amount})>{};
  for (final t in transactions) {
    final matches = incomeMode ? t.isIncome : t.isExpense;
    if (!matches) continue;
    final key = t.category?.id;
    final label = t.category?.name ?? t.name ?? 'Uncategorized';
    final prev = byCategory[key] ?? (label: label, amount: Money.zero());
    byCategory[key] = (label: label, amount: prev.amount + t.amount);
  }

  var total = Money.zero();
  for (final v in byCategory.values) {
    total += v.amount;
  }

  final slices = <StatsSlice>[];
  byCategory.forEach((id, v) {
    final pct = total.amount == 0
        ? 0.0
        : (v.amount.amount / total.amount) * 100;
    slices.add(
      StatsSlice(
        categoryId: id,
        label: v.label,
        amount: v.amount,
        percent: pct.clamp(0, 100).toDouble(),
      ),
    );
  });
  slices.sort((a, b) => b.amount.amount.compareTo(a.amount.amount));
  return slices;
}

Money sumOfSlices(List<StatsSlice> slices) {
  var t = Money.zero();
  for (final s in slices) {
    t += s.amount;
  }
  return t;
}

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

/// Aggregates a month's transactions by their note (`name`) for one mode.
/// Transactions with no note collapse into a single blank-label row (mirrors
/// the WMoney Note tab). Sorted by count desc, then amount desc.
List<NoteRow> aggregateNotes({
  required List<Transaction> transactions,
  required bool incomeMode,
}) {
  final byNote = <String, ({int count, Money amount})>{};
  for (final t in transactions) {
    final matches = incomeMode ? t.isIncome : t.isExpense;
    if (!matches) continue;
    final key = (t.name ?? '').trim();
    final prev = byNote[key] ?? (count: 0, amount: Money.zero());
    byNote[key] = (count: prev.count + 1, amount: prev.amount + t.amount);
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
