import 'package:flutter/foundation.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/transaction.dart';

/// Per-day group rendered by `TransactionsDailyScreen`.
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

class TransactionsDailyViewModel extends ChangeNotifier {
  TransactionsDailyViewModel(this._repo) {
    load(_month);
  }

  final TransactionsRepository _repo;

  DateTime _month = _firstOfMonth(DateTime.now());
  bool _loading = false;
  AppError? _error;
  List<DailyGroup> _groups = const [];
  Money _income = Money.zero();
  Money _expense = Money.zero();

  DateTime get month => _month;
  bool get loading => _loading;
  AppError? get error => _error;
  List<DailyGroup> get groups => _groups;
  Money get income => _income;
  Money get expense => _expense;
  Money get net => _income - _expense;

  Future<void> setMonth(DateTime newMonth) async {
    final normalized = _firstOfMonth(newMonth);
    if (normalized == _month && _groups.isNotEmpty) return;
    _month = normalized;
    notifyListeners();
    await load(_month);
  }

  Future<void> load(DateTime month) async {
    _loading = true;
    _error = null;
    notifyListeners();

    final to = DateTime(month.year, month.month + 1, 0);
    final res = await _repo.list(
      TransactionsListQuery(from: month, to: to),
    );
    res.fold(
      (txs) {
        final byDay = <DateTime, List<Transaction>>{};
        for (final t in txs) {
          byDay.putIfAbsent(t.date, () => <Transaction>[]).add(t);
        }
        final sortedDays = byDay.keys.toList()
          ..sort((a, b) => b.compareTo(a));

        var income = Money.zero();
        var expense = Money.zero();
        final groups = <DailyGroup>[];
        for (final day in sortedDays) {
          final items = byDay[day]!;
          var dayIncome = Money.zero();
          var dayExpense = Money.zero();
          for (final t in items) {
            if (t.isIncome) dayIncome += t.amount;
            if (t.isExpense) dayExpense += t.amount;
          }
          income += dayIncome;
          expense += dayExpense;
          groups.add(
            DailyGroup(
              date: day,
              items: items,
              income: dayIncome,
              expense: dayExpense,
            ),
          );
        }
        _groups = groups;
        _income = income;
        _expense = expense;
      },
      (e) {
        _error = e;
        _groups = const [];
        _income = Money.zero();
        _expense = Money.zero();
      },
    );

    _loading = false;
    notifyListeners();
  }

  static DateTime _firstOfMonth(DateTime d) => DateTime(d.year, d.month);
}
