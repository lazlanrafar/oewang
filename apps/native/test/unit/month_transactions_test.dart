import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/transactions/transactions_month_controller.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/transaction.dart';

Decimal d(String v) => Decimal.parse(v);

Transaction tx(
  String id,
  TransactionType type,
  String amount,
  DateTime date, {
  String currency = 'IDR',
  String? base,
}) => Transaction(
  id: id,
  type: type,
  amount: Money(amount: d(amount), currency: currency),
  baseAmount: base == null ? null : d(base),
  date: date,
  walletId: 'w',
);

void main() {
  group('MOB-4 groupByDay', () {
    test('returns most-recent day first and totals correctly', () {
      final groups = groupByDay([
        tx('a', TransactionType.expense, '10', DateTime(2026, 1, 5)),
        tx('b', TransactionType.expense, '20', DateTime(2026, 1, 5)),
        tx('c', TransactionType.income, '50', DateTime(2026, 1, 4)),
      ], currency: 'IDR');
      expect(groups.length, 2);
      expect(groups.first.date, DateTime(2026, 1, 5));
      expect(groups.first.expense.amount, d('30'));
      expect(groups.first.income.amount, Decimal.zero);
      expect(groups.last.income.amount, d('50'));
    });

    test('adds base amounts, so wallets in other currencies sum right', () {
      final groups = groupByDay([
        tx('a', TransactionType.expense, '10000', DateTime(2026, 1, 5)),
        // A USD wallet: 2.50 USD was 40,000.0000 in the workspace currency.
        tx(
          'b',
          TransactionType.expense,
          '2.50',
          DateTime(2026, 1, 5),
          currency: 'USD',
          base: '40000.0000',
        ),
      ], currency: 'IDR');
      expect(groups.single.expense, Money(amount: d('50000'), currency: 'IDR'));
    });

    test('sums decimals exactly, where doubles drift', () {
      final groups = groupByDay([
        tx('a', TransactionType.expense, '0.1', DateTime(2026, 1, 5)),
        tx('b', TransactionType.expense, '0.2', DateTime(2026, 1, 5)),
      ], currency: 'USD');
      expect(groups.single.expense.amount, d('0.3'));
    });
  });
}
