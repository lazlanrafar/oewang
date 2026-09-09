import 'dart:async';
import 'dart:io';

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

class MonthTransactionsState {
  const MonthTransactionsState({
    required this.items,
    required this.hasMore,
    required this.page,
    required this.isLoadingMore,
  });

  final List<Transaction> items;
  final bool hasMore;
  final int page;
  final bool isLoadingMore;

  MonthTransactionsState copyWith({
    List<Transaction>? items,
    bool? hasMore,
    int? page,
    bool? isLoadingMore,
  }) => MonthTransactionsState(
    items: items ?? this.items,
    hasMore: hasMore ?? this.hasMore,
    page: page ?? this.page,
    isLoadingMore: isLoadingMore ?? this.isLoadingMore,
  );
}

class MonthTransactionsNotifier
    extends AutoDisposeFamilyAsyncNotifier<MonthTransactionsState, DateTime> {
  @override
  Future<MonthTransactionsState> build(DateTime arg) async {
    ref.watch(transactionsRevisionProvider);
    final repo = ref.watch(transactionsRepositoryProvider);
    final from = DateTime(arg.year, arg.month, 1);
    final to = DateTime(arg.year, arg.month + 1, 0, 23, 59, 59);

    // Read local cache immediately or fetch remote
    final res = await repo.list(
      TransactionsListQuery(from: from, to: to, page: 1, limit: 100),
    );

    final items = res.fold((txs) => txs, (_) => <Transaction>[]);

    if (!kDebugMode && !Platform.environment.containsKey('FLUTTER_TEST')) {
      unawaited(
        Future.delayed(const Duration(milliseconds: 100), () {
          if (!ref.exists(monthTransactionsNotifierProvider(arg))) return;
          for (var i = 1; i <= 5; i++) {
            final prev = DateTime(arg.year, arg.month - i);
            final next = DateTime(arg.year, arg.month + i);
            ref.read(transactionsRepositoryProvider).list(
                  TransactionsListQuery(
                    from: DateTime(prev.year, prev.month, 1),
                    to: DateTime(prev.year, prev.month + 1, 0, 23, 59, 59),
                    page: 1,
                    limit: 100,
                  ),
                );
            ref.read(transactionsRepositoryProvider).list(
                  TransactionsListQuery(
                    from: DateTime(next.year, next.month, 1),
                    to: DateTime(next.year, next.month + 1, 0, 23, 59, 59),
                    page: 1,
                    limit: 100,
                  ),
                );
          }
        }),
      );
    }

    return MonthTransactionsState(
      items: items,
      hasMore: items.length >= 100,
      page: 1,
      isLoadingMore: false,
    );
  }

  Future<void> fetchNextPage() async {
    final current = state.valueOrNull;
    if (current == null || !current.hasMore || current.isLoadingMore) return;

    state = AsyncData(current.copyWith(isLoadingMore: true));
    final nextPage = current.page + 1;
    final repo = ref.read(transactionsRepositoryProvider);
    final from = DateTime(arg.year, arg.month, 1);
    final to = DateTime(arg.year, arg.month + 1, 0, 23, 59, 59);

    final res = await repo.list(
      TransactionsListQuery(from: from, to: to, page: nextPage, limit: 100),
    );

    res.fold(
      (newItems) {
        final all = [...current.items, ...newItems];
        state = AsyncData(
          current.copyWith(
            items: all,
            page: nextPage,
            hasMore: newItems.length >= 100,
            isLoadingMore: false,
          ),
        );
      },
      (_) {
        state = AsyncData(current.copyWith(isLoadingMore: false));
      },
    );
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
