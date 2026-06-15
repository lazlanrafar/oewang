import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/transaction.dart';
import 'package:oewang/ui/transactions/view_models/month_transactions_controller.dart';

void main() {
  group('groupByDay', () {
    test('returns most-recent day first and totals correctly', () {
      final txs = <Transaction>[
        Transaction(
          id: 'a',
          type: TransactionType.expense,
          amount: const Money(amount: 10),
          date: DateTime(2026, 1, 5),
          walletId: 'w',
        ),
        Transaction(
          id: 'b',
          type: TransactionType.expense,
          amount: const Money(amount: 20),
          date: DateTime(2026, 1, 5),
          walletId: 'w',
        ),
        Transaction(
          id: 'c',
          type: TransactionType.income,
          amount: const Money(amount: 50),
          date: DateTime(2026, 1, 4),
          walletId: 'w',
        ),
      ];
      final groups = groupByDay(txs);
      expect(groups.length, 2);
      expect(groups.first.date, DateTime(2026, 1, 5));
      expect(groups.first.expense.amount, 30);
      expect(groups.first.income.amount, 0);
      expect(groups.last.income.amount, 50);
    });
  });

  group('computeMonthTotals', () {
    test('sums income and expense separately', () {
      final txs = [
        Transaction(
          id: 'a',
          type: TransactionType.income,
          amount: const Money(amount: 1000),
          date: DateTime(2026, 1, 1),
          walletId: 'w',
        ),
        Transaction(
          id: 'b',
          type: TransactionType.expense,
          amount: const Money(amount: 700),
          date: DateTime(2026, 1, 1),
          walletId: 'w',
        ),
      ];
      final t = computeMonthTotals(txs);
      expect(t.income.amount, 1000);
      expect(t.expense.amount, 700);
      expect(t.net.amount, 300);
    });
  });
}
