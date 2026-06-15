import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/app_theme.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/repositories_fake/transactions_repository_fake.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/transaction.dart';
import 'package:oewang/ui/transactions/widgets/transactions_daily_screen.dart';

void main() {
  testWidgets(
    'TransactionsDailyScreen renders day groups against the fake repo',
    (tester) async {
      final now = DateTime.now();
      final monthStart = DateTime(now.year, now.month);
      final seed = [
        Transaction(
          id: 't1',
          type: TransactionType.expense,
          amount: const Money(amount: 5000),
          date: monthStart,
          walletId: 'w-cash',
          name: 'Food',
          category: const NamedRef(id: 'cat-food', name: 'Food'),
          wallet: const NamedRef(id: 'w-cash', name: 'Cash'),
        ),
        Transaction(
          id: 't2',
          type: TransactionType.expense,
          amount: const Money(amount: 28000),
          date: DateTime(now.year, now.month, 2),
          walletId: 'w-bca',
          name: 'Laundry',
          category: const NamedRef(id: 'cat-laundry', name: 'Laundry'),
          wallet: const NamedRef(id: 'w-bca', name: 'BCA'),
        ),
      ];
      final fake = TransactionsRepositoryFake(seed: seed);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            transactionsRepositoryProvider.overrideWith(
              (ref) => fake as TransactionsRepository,
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.dark(),
            home: const Scaffold(body: TransactionsDailyScreen()),
          ),
        ),
      );

      await tester.pumpAndSettle(const Duration(milliseconds: 50));

      expect(find.text('Food'), findsOneWidget);
      expect(find.text('Laundry'), findsOneWidget);
      expect(find.text('01'), findsOneWidget);
      expect(find.text('02'), findsOneWidget);
    },
  );
}
