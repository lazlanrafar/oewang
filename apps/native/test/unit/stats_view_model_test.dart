import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/stats/stats_view_model.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/transaction.dart';

void main() {
  group('aggregateStats', () {
    test('groups expenses by category and computes percentages', () {
      final txs = <Transaction>[
        Transaction(
          id: 't1',
          type: TransactionType.expense,
          amount: const Money(amount: 1800000),
          date: DateTime(2026, 1, 5),
          walletId: 'w',
          category: const NamedRef(id: 'cat-rent', name: 'Rent'),
        ),
        Transaction(
          id: 't2',
          type: TransactionType.expense,
          amount: const Money(amount: 124500),
          date: DateTime(2026, 1, 4),
          walletId: 'w',
          category: const NamedRef(id: 'cat-food', name: 'Food'),
        ),
        Transaction(
          id: 't3',
          type: TransactionType.expense,
          amount: const Money(amount: 28000),
          date: DateTime(2026, 1, 4),
          walletId: 'w',
          category: const NamedRef(id: 'cat-laundry', name: 'Laundry'),
        ),
        // Income ignored in expense mode.
        Transaction(
          id: 't4',
          type: TransactionType.income,
          amount: const Money(amount: 5000000),
          date: DateTime(2026, 1, 1),
          walletId: 'w',
          category: const NamedRef(id: 'cat-salary', name: 'Salary'),
        ),
      ];

      final slices = aggregateStats(transactions: txs, incomeMode: false);
      expect(slices.length, 3);
      // Sorted by amount descending.
      expect(slices.first.label, 'Rent');
      expect(slices[1].label, 'Food');
      expect(slices.last.label, 'Laundry');
      // Total = 1.952.500. Rent percent ≈ 92.18%.
      expect(slices.first.percent.round(), 92);
      expect(slices[1].percent.round(), 6);
      expect(sumOfSlices(slices).amount, 1952500);
    });

    test('income mode picks only income transactions', () {
      final txs = <Transaction>[
        Transaction(
          id: 't1',
          type: TransactionType.income,
          amount: const Money(amount: 1000),
          date: DateTime(2026, 1, 5),
          walletId: 'w',
          category: const NamedRef(id: 'cat-salary', name: 'Salary'),
        ),
        Transaction(
          id: 't2',
          type: TransactionType.expense,
          amount: const Money(amount: 1000000),
          date: DateTime(2026, 1, 4),
          walletId: 'w',
          category: const NamedRef(id: 'cat-rent', name: 'Rent'),
        ),
      ];
      final slices = aggregateStats(transactions: txs, incomeMode: true);
      expect(slices.length, 1);
      expect(slices.first.label, 'Salary');
      expect(slices.first.percent.round(), 100);
    });

    test('empty input yields empty slices', () {
      final slices = aggregateStats(
        transactions: const [],
        incomeMode: false,
      );
      expect(slices, isEmpty);
      expect(sumOfSlices(slices).amount, 0);
    });
  });

  group('aggregateNotes', () {
    Transaction exp(String? name, num amount) => Transaction(
      id: 't-$name-$amount',
      type: TransactionType.expense,
      amount: Money(amount: amount),
      date: DateTime(2026, 1, 5),
      walletId: 'w',
      name: name,
    );

    test('groups by note with count + sum, sorted by count then amount', () {
      final txs = [
        exp('Coffee', 30000),
        exp('Coffee', 20000),
        exp('Coffee', 10000),
        exp('Rent', 1800000),
        exp('Snack', 5000),
        exp('Snack', 5000),
      ];
      final rows = aggregateNotes(transactions: txs, incomeMode: false);
      expect(rows.length, 3);
      // Coffee (count 3) first.
      expect(rows[0].label, 'Coffee');
      expect(rows[0].count, 3);
      expect(rows[0].amount.amount, 60000);
      // Snack and Rent both count: Snack=2, Rent=1 → Snack before Rent.
      expect(rows[1].label, 'Snack');
      expect(rows[1].count, 2);
      expect(rows[2].label, 'Rent');
    });

    test('collapses missing notes into one blank-label row', () {
      final rows = aggregateNotes(
        transactions: [exp(null, 100), exp('', 200)],
        incomeMode: false,
      );
      expect(rows.length, 1);
      expect(rows.first.label, '');
      expect(rows.first.count, 2);
      expect(rows.first.amount.amount, 300);
    });

    test('respects income/expense mode', () {
      final txs = [
        exp('Food', 1000),
        Transaction(
          id: 'i1',
          type: TransactionType.income,
          amount: const Money(amount: 5000),
          date: DateTime(2026, 1, 1),
          walletId: 'w',
          name: 'Salary',
        ),
      ];
      final income = aggregateNotes(transactions: txs, incomeMode: true);
      expect(income.length, 1);
      expect(income.first.label, 'Salary');
    });
  });
}
