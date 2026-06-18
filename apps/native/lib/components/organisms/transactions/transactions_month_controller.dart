import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/transaction.dart';

/// Active month for the Trans. tab. Shared by every sub-tab so changing the
/// month in any one updates them all.
class MonthController extends Notifier<DateTime> {
  @override
  DateTime build() {
    final now = DateTime.now();
    return DateTime(now.year, now.month);
  }

  void next() => state = DateTime(state.year, state.month + 1);
  void prev() => state = DateTime(state.year, state.month - 1);
  void set(DateTime month) => state = DateTime(month.year, month.month);
}

final monthControllerProvider = NotifierProvider<MonthController, DateTime>(
  MonthController.new,
);

/// Async cache of "all transactions in this month". Every sub-tab listens.
/// Rebuilt whenever the month or the transactions revision changes.
final monthTransactionsProvider = FutureProvider.autoDispose
    .family<List<Transaction>, DateTime>((ref, month) async {
      ref.watch(transactionsRevisionProvider);
      final repo = ref.watch(transactionsRepositoryProvider);
      final to = DateTime(month.year, month.month + 1, 0);
      final res = await repo.list(
        TransactionsListQuery(from: month, to: to),
      );
      return res.fold((txs) => txs, (_) => <Transaction>[]);
    });

/// Convenience: rolled-up totals across the whole month.
class MonthTotals {
  const MonthTotals({required this.income, required this.expense});
  final Money income;
  final Money expense;
  Money get net => income - expense;
}

MonthTotals computeMonthTotals(List<Transaction> txs) {
  var income = Money.zero();
  var expense = Money.zero();
  for (final t in txs) {
    if (t.isIncome) income += t.amount;
    if (t.isExpense) expense += t.amount;
  }
  return MonthTotals(income: income, expense: expense);
}

/// One day's worth of transactions plus its rolled-up totals.
@immutable
class DailyGroup {
  const DailyGroup({
    required this.date,
    required this.items,
    required this.income,
    required this.expense,
  });
  final DateTime date;
  final List<Transaction> items;
  final Money income;
  final Money expense;
  Money get net => income - expense;
}

List<DailyGroup> groupByDay(List<Transaction> txs) {
  final byDay = <DateTime, List<Transaction>>{};
  for (final t in txs) {
    byDay.putIfAbsent(t.date, () => <Transaction>[]).add(t);
  }
  final days = byDay.keys.toList()..sort((a, b) => b.compareTo(a));
  return [
    for (final day in days)
      _build(day, byDay[day]!),
  ];
}

DailyGroup _build(DateTime day, List<Transaction> items) {
  var income = Money.zero();
  var expense = Money.zero();
  for (final t in items) {
    if (t.isIncome) income += t.amount;
    if (t.isExpense) expense += t.amount;
  }
  return DailyGroup(
    date: day,
    items: items,
    income: income,
    expense: expense,
  );
}
