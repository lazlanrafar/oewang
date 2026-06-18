import 'package:flutter/foundation.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/transaction.dart';

@immutable
class WeeklyBucket {
  const WeeklyBucket({
    required this.start,
    required this.end,
    required this.income,
    required this.expense,
  });

  final DateTime start;
  final DateTime end;
  final Money income;
  final Money expense;

  Money get net => income - expense;
}

/// Splits the active month (IMG_1828) into the weekly ranges shown on the
/// screenshot. Each row is `dd/MM ~ dd/MM`, ordered most-recent first.
List<WeeklyBucket> bucketsForMonth(
  DateTime month,
  List<Transaction> txs,
) {
  final firstOfMonth = DateTime(month.year, month.month);
  final lastOfMonth = DateTime(month.year, month.month + 1, 0);

  // Each "week" runs Sunday → Saturday. Walk the month from the first Sunday
  // ≤ the 1st (so the first bucket spans the prior month's tail) through the
  // last Saturday ≥ the last day.
  final firstSunday = firstOfMonth.subtract(
    Duration(days: firstOfMonth.weekday % 7),
  );
  final lastSaturday = lastOfMonth.add(
    Duration(days: 6 - (lastOfMonth.weekday % 7)),
  );

  final buckets = <WeeklyBucket>[];
  var start = firstSunday;
  while (!start.isAfter(lastSaturday)) {
    final end = start.add(const Duration(days: 6));
    var income = Money.zero();
    var expense = Money.zero();
    for (final t in txs) {
      if (!t.date.isBefore(start) && !t.date.isAfter(end)) {
        if (t.isIncome) income += t.amount;
        if (t.isExpense) expense += t.amount;
      }
    }
    buckets.add(
      WeeklyBucket(
        start: start,
        end: end,
        income: income,
        expense: expense,
      ),
    );
    start = start.add(const Duration(days: 7));
  }

  // Newest first, matching the IMG_1828 ordering.
  return buckets.reversed.toList();
}

bool isCurrentWeek(WeeklyBucket bucket, {DateTime? now}) {
  final ref = now ?? DateTime.now();
  final today = DateTime(ref.year, ref.month, ref.day);
  return !today.isBefore(bucket.start) && !today.isAfter(bucket.end);
}
