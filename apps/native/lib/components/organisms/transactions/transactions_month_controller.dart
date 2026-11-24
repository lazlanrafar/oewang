import 'package:decimal/decimal.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
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

class MonthTransactionsState {
  const MonthTransactionsState({required this.items, required this.summary});

  /// Every row of the month, all pages.
  final List<Transaction> items;

  /// The month's totals, from the API (D27).
  final TransactionsSummary summary;
}

/// Rows per request; the API caps `limit` at 100.
const _pageSize = 100;

/// A month past this many rows shows its first 2,000 and the API's totals.
const _maxPages = 20;

class MonthTransactionsNotifier
    extends AutoDisposeFamilyAsyncNotifier<MonthTransactionsState, DateTime> {
  @override
  Future<MonthTransactionsState> build(DateTime arg) async {
    ref.watch(transactionsRevisionProvider);
    final repo = ref.watch(transactionsRepositoryProvider);
    final from = DateTime(arg.year, arg.month);
    final to = DateTime(arg.year, arg.month + 1, 0);

    final summary = repo.summary(from: from, to: to);

    // Every page, so the day, week and calendar groupings see the whole
    // month (the old app stopped at the first 100 and under-counted).
    final items = <Transaction>[];
    for (var page = 1; page <= _maxPages; page++) {
      final res = await repo.list(
        TransactionsListQuery(from: from, to: to, page: page),
      );
      if (res case Failure(:final error)) throw error;
      final batch = (res as Success<List<Transaction>, AppError>).value;
      items.addAll(batch);
      if (batch.length < _pageSize) break;
    }

    return switch (await summary) {
      Success(:final value) => MonthTransactionsState(
        items: items,
        summary: value,
      ),
      Failure(:final error) => throw error,
    };
  }
}

final monthTransactionsNotifierProvider = AsyncNotifierProvider.autoDispose
    .family<MonthTransactionsNotifier, MonthTransactionsState, DateTime>(
      MonthTransactionsNotifier.new,
    );

final monthTransactionsProvider = Provider.autoDispose
    .family<AsyncValue<List<Transaction>>, DateTime>((ref, month) {
      final async = ref.watch(monthTransactionsNotifierProvider(month));
      return async.whenData((s) => s.items);
    });

/// The month's income and expense, from `GET /v1/transactions/summary`.
final monthSummaryProvider = Provider.autoDispose
    .family<AsyncValue<TransactionsSummary>, DateTime>((ref, month) {
      final async = ref.watch(monthTransactionsNotifierProvider(month));
      return async.whenData((s) => s.summary);
    });

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

/// Groups by local day, newest first. A day's figures add the rows'
/// `base_amount`, the workspace-currency figure the API computed for each,
/// so wallets in different currencies sum correctly. [currency] is the
/// workspace's, from the month summary.
List<DailyGroup> groupByDay(List<Transaction> txs, {required String currency}) {
  final byDay = <DateTime, List<Transaction>>{};
  for (final t in txs) {
    byDay.putIfAbsent(t.date, () => <Transaction>[]).add(t);
  }
  final days = byDay.keys.toList()..sort((a, b) => b.compareTo(a));
  return [for (final day in days) _build(day, byDay[day]!, currency)];
}

DailyGroup _build(DateTime day, List<Transaction> items, String currency) {
  final (:income, :expense) = sumByType(items, currency: currency);
  return DailyGroup(date: day, items: items, income: income, expense: expense);
}

/// Income and expense of [txs] in the workspace currency, from each row's
/// `base_amount`. Exact: [Decimal] addition, no rounding.
({Money income, Money expense}) sumByType(
  Iterable<Transaction> txs, {
  required String currency,
}) {
  var income = Decimal.zero;
  var expense = Decimal.zero;
  for (final t in txs) {
    if (t.isIncome) income += t.baseAmount;
    if (t.isExpense) expense += t.baseAmount;
  }
  return (
    income: Money(amount: income, currency: currency),
    expense: Money(amount: expense, currency: currency),
  );
}
