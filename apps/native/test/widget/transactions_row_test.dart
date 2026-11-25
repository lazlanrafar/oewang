import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/transactions/transactions_row.dart';
import 'package:oewang/core/theme/app_theme.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/transaction.dart';

Money _idr(int v) => Money(amount: Decimal.fromInt(v), currency: 'IDR');

Transaction _tx({int others = 0, Money? matched}) => Transaction(
  id: 't1',
  type: TransactionType.expense,
  amount: _idr(500000),
  date: DateTime(2026, 11, 3),
  walletId: 'w1',
  categoryId: 'c1',
  name: 'Supermarket',
  category: const NamedRef(id: 'c1', name: 'Groceries'),
  otherCategoryCount: others,
  matchedAmount: matched,
);

Future<void> _pump(WidgetTester tester, Transaction tx) => tester.pumpWidget(
  MaterialApp(
    theme: AppTheme.light(),
    home: Scaffold(body: TransactionRow(transaction: tx)),
  ),
);

void main() {
  group('MOB-11 TransactionRow', () {
    testWidgets('a plain row has no count and one amount', (tester) async {
      await _pump(tester, _tx());
      expect(find.text('Groceries'), findsOneWidget);
      expect(find.textContaining('+'), findsNothing);
      expect(find.text(_idr(500000).format()), findsOneWidget);
    });

    testWidgets('items in other categories add "+N" to the category', (
      tester,
    ) async {
      await _pump(tester, _tx(others: 2));
      expect(find.text('Groceries'), findsOneWidget);
      expect(find.text(' +2'), findsOneWidget);
    });

    testWidgets('a matched portion shows beside the whole amount', (
      tester,
    ) async {
      await _pump(tester, _tx(matched: _idr(40000)));
      expect(find.text(_idr(500000).format()), findsOneWidget);
      expect(find.text(_idr(40000).format()), findsOneWidget);
    });
  });
}
