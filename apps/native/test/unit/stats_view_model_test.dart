import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/stats/stats_view_model.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/overview.dart';
import 'package:oewang/domain/models/transaction.dart';

void main() {
  group('MOB-4 slicesFrom', () {
    test("keeps the API's order, totals and shares, and names Other", () {
      final slices = slicesFrom([
        CategoryShare(
          id: 'cat-rent',
          name: 'Rent',
          total: Money(amount: Decimal.fromInt(1800000)),
          sharePercent: Decimal.parse('92.19'),
        ),
        CategoryShare(
          other: true,
          total: Money(amount: Decimal.fromInt(152500)),
          sharePercent: Decimal.parse('7.81'),
        ),
        CategoryShare(total: Money(amount: Decimal.zero)),
      ]);
      expect(slices.map((s) => s.label), ['Rent', 'Other', 'Uncategorized']);
      expect(slices.first.amount.amount, Decimal.fromInt(1800000));
      expect(slices.first.percent.round(), 92);
      // No share from the API draws as an empty slice, never a guess.
      expect(slices.last.percent, 0);
    });
  });

  group('aggregateNotes', () {
    Transaction exp(String? name, int amount) => Transaction(
      id: 't-$name-$amount',
      type: TransactionType.expense,
      amount: Money(amount: Decimal.fromInt(amount), currency: 'USD'),
      // The workspace-currency figure is what the Note tab adds.
      baseAmount: Decimal.fromInt(amount * 2),
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
      final rows = aggregateNotes(
        transactions: txs,
        incomeMode: false,
        currency: 'IDR',
      );
      expect(rows.length, 3);
      // Coffee (count 3) first.
      expect(rows[0].label, 'Coffee');
      expect(rows[0].count, 3);
      expect(rows[0].amount.amount, Decimal.fromInt(120000));
      expect(rows[0].amount.currency, 'IDR');
      // Snack and Rent both count: Snack=2, Rent=1 → Snack before Rent.
      expect(rows[1].label, 'Snack');
      expect(rows[1].count, 2);
      expect(rows[2].label, 'Rent');
    });

    test('collapses missing notes into one blank-label row', () {
      final rows = aggregateNotes(
        transactions: [exp(null, 100), exp('', 200)],
        incomeMode: false,
        currency: 'IDR',
      );
      expect(rows.length, 1);
      expect(rows.first.label, '');
      expect(rows.first.count, 2);
      expect(rows.first.amount.amount, Decimal.fromInt(600));
    });

    test('respects income/expense mode', () {
      final txs = [
        exp('Food', 1000),
        Transaction(
          id: 'i1',
          type: TransactionType.income,
          amount: Money(amount: Decimal.fromInt(5000)),
          date: DateTime(2026, 1, 1),
          walletId: 'w',
          name: 'Salary',
        ),
      ];
      final income = aggregateNotes(
        transactions: txs,
        incomeMode: true,
        currency: 'IDR',
      );
      expect(income.length, 1);
      expect(income.first.label, 'Salary');
    });
  });
}
