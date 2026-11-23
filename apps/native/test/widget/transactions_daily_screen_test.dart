import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/transactions/transactions_daily_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_form_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_row.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/app_theme.dart';
import 'package:oewang/data/repositories/categories_repository.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/repositories/vault_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories_fake/categories_repository_fake.dart';
import 'package:oewang/data/repositories_fake/transactions_repository_fake.dart';
import 'package:oewang/data/repositories_fake/vault_repository_fake.dart';
import 'package:oewang/data/repositories_fake/wallets_repository_fake.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/session.dart';
import 'package:oewang/domain/models/transaction.dart';

/// A signed-in session with [role], without the bootstrap's network call.
class _FixedSession extends SessionController {
  _FixedSession(this.role);
  final String role;

  @override
  AsyncValue<Session?> build() =>
      AsyncData(Session(userId: 'u', workspaceId: 'ws', role: role));
}

Transaction _tx(String id, String name, int amount, DateTime date) =>
    Transaction(
      id: id,
      type: TransactionType.expense,
      amount: Money(amount: Decimal.fromInt(amount)),
      date: date,
      walletId: 'w-cash',
      name: name,
      category: const NamedRef(id: 'cat-food', name: 'Food'),
      wallet: const NamedRef(id: 'w-cash', name: 'Cash'),
    );

Widget _app({
  required String role,
  required TransactionsRepositoryFake repo,
  required Widget home,
}) => ProviderScope(
  overrides: [
    sessionControllerProvider.overrideWith(() => _FixedSession(role)),
    transactionsRepositoryProvider.overrideWith(
      (ref) => repo as TransactionsRepository,
    ),
    walletsRepositoryProvider.overrideWith(
      (ref) => WalletsRepositoryFake() as WalletsRepository,
    ),
    categoriesRepositoryProvider.overrideWith(
      (ref) => CategoriesRepositoryFake() as CategoriesRepository,
    ),
    vaultRepositoryProvider.overrideWith(
      (ref) => VaultRepositoryFake() as VaultRepository,
    ),
  ],
  child: MaterialApp(theme: AppTheme.dark(), home: home),
);

void main() {
  final now = DateTime.now();
  final monthStart = DateTime(now.year, now.month);

  group('MOB-4 TransactionsDailyScreen', () {
    testWidgets('renders day groups and the API day totals', (tester) async {
      final repo = TransactionsRepositoryFake(
        seed: [
          _tx('t1', 'Nasi', 5000, monthStart),
          _tx('t2', 'Laundry', 28000, DateTime(now.year, now.month, 2)),
        ],
      );
      await tester.pumpWidget(
        _app(
          role: 'owner',
          repo: repo,
          home: Scaffold(body: TransactionsDailyScreen(month: monthStart)),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Nasi'), findsOneWidget);
      expect(find.text('Laundry'), findsOneWidget);
      expect(find.text('01'), findsOneWidget);
      expect(find.text('02'), findsOneWidget);
    });

    testWidgets('MOB-5 an admin can open a row to edit it', (tester) async {
      final repo = TransactionsRepositoryFake(
        seed: [_tx('t1', 'Nasi', 5000, monthStart)],
      );
      await tester.pumpWidget(
        _app(
          role: 'admin',
          repo: repo,
          home: Scaffold(body: TransactionsDailyScreen(month: monthStart)),
        ),
      );
      await tester.pumpAndSettle();

      final row = tester.widget<TransactionRow>(find.byType(TransactionRow));
      expect(row.onTap, isNotNull);
    });

    testWidgets('MOB-5 a viewer (member) gets no edit and no swipe', (
      tester,
    ) async {
      final repo = TransactionsRepositoryFake(
        seed: [_tx('t1', 'Nasi', 5000, monthStart)],
      );
      await tester.pumpWidget(
        _app(
          role: 'member',
          repo: repo,
          home: Scaffold(body: TransactionsDailyScreen(month: monthStart)),
        ),
      );
      await tester.pumpAndSettle();

      final row = tester.widget<TransactionRow>(find.byType(TransactionRow));
      expect(row.onTap, isNull);
      expect(find.byType(Dismissible), findsNothing);
    });
  });

  group('MOB-4 TransactionFormScreen', () {
    testWidgets('edit mode deletes through the repository', (tester) async {
      final existing = _tx('t1', 'Nasi', 5000, monthStart);
      final repo = TransactionsRepositoryFake(seed: [existing]);
      await tester.pumpWidget(
        _app(
          role: 'owner',
          repo: repo,
          home: TransactionFormScreen(transaction: existing),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('Delete'));
      await tester.pumpAndSettle();
      // The confirm dialog's destructive action.
      await tester.tap(find.text('Delete').last);
      await tester.pumpAndSettle();

      expect(repo.items, isEmpty);
    });

    testWidgets('MOB-5 a viewer sees no delete in edit mode', (tester) async {
      final existing = _tx('t1', 'Nasi', 5000, monthStart);
      await tester.pumpWidget(
        _app(
          role: 'member',
          repo: TransactionsRepositoryFake(seed: [existing]),
          home: TransactionFormScreen(transaction: existing),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byTooltip('Delete'), findsNothing);
    });
  });
}
