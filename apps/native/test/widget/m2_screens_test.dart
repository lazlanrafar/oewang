import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/components/organisms/budgets/budgets_setting_screen.dart';
import 'package:oewang/components/organisms/categories/categories_list_screen.dart';
import 'package:oewang/components/organisms/settings/currency/settings_main_currency_screen.dart';
import 'package:oewang/components/organisms/settings/members/settings_members_screen.dart';
import 'package:oewang/components/organisms/stats/stats_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_include_in_totals_screen.dart';
import 'package:oewang/components/organisms/wallets/wallets_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/theme/app_theme.dart';
import 'package:oewang/data/repositories/budgets_repository.dart';
import 'package:oewang/data/repositories/categories_repository.dart';
import 'package:oewang/data/repositories/overview_repository.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/repositories/wallet_groups_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories/workspaces_repository.dart';
import 'package:oewang/data/repositories_fake/budgets_repository_fake.dart';
import 'package:oewang/data/repositories_fake/categories_repository_fake.dart';
import 'package:oewang/data/repositories_fake/overview_repository_fake.dart';
import 'package:oewang/data/repositories_fake/transactions_repository_fake.dart';
import 'package:oewang/data/repositories_fake/wallet_groups_repository_fake.dart';
import 'package:oewang/data/repositories_fake/wallets_repository_fake.dart';
import 'package:oewang/data/repositories_fake/workspaces_repository_fake.dart';
import 'package:oewang/domain/models/category.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/session.dart';
import 'package:oewang/domain/models/wallet.dart';

/// A signed-in session with [role], without the bootstrap's network call.
class _FixedSession extends SessionController {
  _FixedSession(this.role);
  final String role;

  @override
  AsyncValue<Session?> build() =>
      AsyncData(Session(userId: 'u', workspaceId: 'ws', role: role));
}

Widget _app(String role, Widget home, {WalletsRepositoryFake? wallets}) =>
    ProviderScope(
      overrides: [
        sessionControllerProvider.overrideWith(() => _FixedSession(role)),
        walletsRepositoryProvider.overrideWith(
          (ref) => (wallets ?? WalletsRepositoryFake()) as WalletsRepository,
        ),
        walletGroupsRepositoryProvider.overrideWith(
          (ref) => WalletGroupsRepositoryFake() as WalletGroupsRepository,
        ),
        workspacesRepositoryProvider.overrideWith(
          (ref) => WorkspacesRepositoryFake() as WorkspacesRepository,
        ),
        categoriesRepositoryProvider.overrideWith(
          (ref) => CategoriesRepositoryFake() as CategoriesRepository,
        ),
        budgetsRepositoryProvider.overrideWith(
          (ref) => BudgetsRepositoryFake() as BudgetsRepository,
        ),
        overviewRepositoryProvider.overrideWith(
          (ref) => OverviewRepositoryFake() as OverviewRepository,
        ),
        transactionsRepositoryProvider.overrideWith(
          (ref) => TransactionsRepositoryFake() as TransactionsRepository,
        ),
      ],
      child: MaterialApp(theme: AppTheme.dark(), home: home),
    );

Future<void> _pump(WidgetTester tester, String role, Widget home) async {
  await tester.pumpWidget(_app(role, home));
  await tester.pumpAndSettle();
}

void main() {
  group('MOB-4 accounts', () {
    testWidgets('MOB-5 an admin gets add and edit', (tester) async {
      await _pump(tester, 'admin', const WalletsScreen());
      expect(find.text('Cash'), findsWidgets);
      expect(find.byIcon(Icons.add), findsOneWidget);
      expect(find.byIcon(Icons.edit_outlined), findsOneWidget);
    });

    testWidgets('MOB-5 a member reads the list with no write control', (
      tester,
    ) async {
      await _pump(tester, 'member', const WalletsScreen());
      expect(find.text('Cash'), findsWidgets);
      expect(find.byIcon(Icons.add), findsNothing);
      expect(find.byIcon(Icons.edit_outlined), findsNothing);
      final row = tester.widget<ListTile>(find.byType(ListTile).first);
      expect(row.onTap, isNull);
    });

    testWidgets('a saved transaction reloads the balances', (tester) async {
      // The tab stays mounted under the others; an expense moves a balance.
      final wallets = WalletsRepositoryFake();
      await tester.pumpWidget(
        _app('owner', const WalletsScreen(), wallets: wallets),
      );
      await tester.pumpAndSettle();
      Finder cash(int v) => find.descendant(
        of: find.widgetWithText(ListTile, 'Cash'),
        matching: find.text(Money(amount: Decimal.fromInt(v)).format()),
      );
      expect(cash(625000), findsOneWidget);
      await tester.runAsync(
        () => wallets.adjust('w-cash', Decimal.fromInt(575000)),
      );
      ProviderScope.containerOf(
        tester.element(find.byType(WalletsScreen)),
      ).read(transactionsRevisionProvider.notifier).bump();
      await tester.pumpAndSettle();
      expect(cash(575000), findsOneWidget);
    });

    testWidgets('a tick writes the totals flag', (tester) async {
      final wallets = WalletsRepositoryFake();
      await tester.pumpWidget(
        _app('owner', const IncludeInTotalsScreen(), wallets: wallets),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('BNI'));
      await tester.pumpAndSettle();
      // The fake's delay is real time, outside the widget clock.
      final res = await tester.runAsync(wallets.list);
      final list = res!.fold((w) => w, (_) => <Wallet>[]);
      expect(list.firstWhere((w) => w.id == 'w-bni').isIncludedInTotals, false);
    });

    testWidgets('MOB-5 a member cannot untick', (tester) async {
      await _pump(tester, 'member', const IncludeInTotalsScreen());
      final box = tester.widget<Checkbox>(find.byType(Checkbox).first);
      expect(box.onChanged, isNull);
    });
  });

  group('MOB-4 categories', () {
    testWidgets('MOB-5 an admin gets add, delete and drag', (tester) async {
      await _pump(
        tester,
        'admin',
        const CategoryListScreen(type: CategoryType.expense),
      );
      expect(find.byIcon(Icons.add), findsOneWidget);
      expect(find.byIcon(Icons.remove_circle), findsWidgets);
      expect(find.byIcon(Icons.drag_handle), findsWidgets);
    });

    testWidgets('MOB-5 a member sees the list only', (tester) async {
      await _pump(
        tester,
        'member',
        const CategoryListScreen(type: CategoryType.expense),
      );
      expect(find.byIcon(Icons.add), findsNothing);
      expect(find.byIcon(Icons.remove_circle), findsNothing);
      expect(find.byIcon(Icons.drag_handle), findsNothing);
      expect(find.byIcon(Icons.edit_outlined), findsNothing);
    });
  });

  group('MOB-4 budgets', () {
    testWidgets("shows the API's used percent", (tester) async {
      await _pump(tester, 'owner', const BudgetSettingScreen());
      // 1,924,500 of 3,500,000, as the fake API states it.
      expect(find.text('54%'), findsOneWidget);
      expect(find.text('Food'), findsOneWidget);
      expect(find.byType(Dismissible), findsNWidgets(2));
    });

    testWidgets('MOB-5 a member gets no add and no swipe', (tester) async {
      await _pump(tester, 'member', const BudgetSettingScreen());
      expect(find.byIcon(Icons.add), findsNothing);
      expect(find.byType(Dismissible), findsNothing);
    });
  });

  testWidgets('MOB-4 stats draws the overview shares', (tester) async {
    await _pump(tester, 'member', const StatsScreen());
    expect(find.text('Food'), findsOneWidget);
    expect(find.text('75%'), findsOneWidget);
    expect(find.text('Uncategorized'), findsOneWidget);
  });

  group('MOB-4 settings', () {
    testWidgets('MOB-5 the owner may change the currency', (tester) async {
      await _pump(tester, 'owner', const MainCurrencyScreen());
      expect(find.textContaining('IDR'), findsWidgets);
      expect(find.text('Change'), findsOneWidget);
    });

    testWidgets('MOB-5 an admin may not', (tester) async {
      await _pump(tester, 'admin', const MainCurrencyScreen());
      expect(find.textContaining('IDR'), findsWidgets);
      expect(find.text('Change'), findsNothing);
    });

    testWidgets('members are listed with their role', (tester) async {
      await _pump(tester, 'member', const MembersScreen());
      expect(find.text('Test User'), findsOneWidget);
      expect(find.text('Owner'), findsOneWidget);
    });
  });
}
