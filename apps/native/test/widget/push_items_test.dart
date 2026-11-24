import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:oewang/components/organisms/transactions/transactions_form_screen.dart';
import 'package:oewang/components/organisms/transactions/transactions_screen.dart';
import 'package:oewang/components/organisms/vault/vault_screen.dart';
import 'package:oewang/config/dependencies.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/core/router/app_router.dart';
import 'package:oewang/core/router/push_route.dart';
import 'package:oewang/core/theme/app_theme.dart';
import 'package:oewang/data/repositories/budgets_repository.dart';
import 'package:oewang/data/repositories/categories_repository.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/repositories/vault_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories_fake/budgets_repository_fake.dart';
import 'package:oewang/data/repositories_fake/categories_repository_fake.dart';
import 'package:oewang/data/repositories_fake/transactions_repository_fake.dart';
import 'package:oewang/data/repositories_fake/vault_repository_fake.dart';
import 'package:oewang/data/repositories_fake/wallets_repository_fake.dart';
import 'package:oewang/data/services/sync/sync_service.dart';
import 'package:oewang/domain/models/budget_status.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/session.dart';
import 'package:oewang/domain/models/transaction.dart';
import 'package:oewang/domain/models/vault_file.dart';

/// Signed in as [role]; [loading] holds the session unresolved, as on a cold
/// start, until [resolve].
class _Session extends SessionController {
  _Session(this.role, {this.loading = false});
  final String role;
  final bool loading;

  static const _value = Session(userId: 'u', workspaceId: 'ws', role: 'owner');

  @override
  AsyncValue<Session?> build() => loading
      ? const AsyncLoading()
      : AsyncData(Session(userId: 'u', workspaceId: 'ws', role: role));

  void resolve() => state = const AsyncData(_value);
}

/// Records the month the budget screen asked for.
class _Budgets extends BudgetsRepositoryFake {
  ({int? month, int? year})? asked;

  @override
  Future<Result<BudgetMonth, AppError>> status({int? month, int? year}) {
    asked = (month: month, year: year);
    return super.status(month: month, year: year);
  }
}

final _receipt = Transaction(
  id: 'tx-receipt',
  type: TransactionType.expense,
  amount: Money(amount: Decimal.fromInt(42000)),
  date: DateTime.now(),
  walletId: 'w-cash',
  name: 'Warung Made',
);

class _Harness {
  _Harness(WidgetTester tester, {String role = 'owner', bool loading = false})
    : _tester = tester,
      session = _Session(role, loading: loading);

  final WidgetTester _tester;
  final _Session session;
  final budgets = _Budgets();
  late final ProviderContainer container;
  late final GoRouter router;

  Future<void> pump() async {
    container = ProviderContainer(
      overrides: [
        sessionControllerProvider.overrideWith(() => session),
        syncStatusProvider.overrideWithValue(const SyncStatus()),
        transactionsRepositoryProvider.overrideWith(
          (ref) =>
              TransactionsRepositoryFake(seed: [_receipt])
                  as TransactionsRepository,
        ),
        walletsRepositoryProvider.overrideWith(
          (ref) => WalletsRepositoryFake() as WalletsRepository,
        ),
        categoriesRepositoryProvider.overrideWith(
          (ref) => CategoriesRepositoryFake() as CategoriesRepository,
        ),
        budgetsRepositoryProvider.overrideWith(
          (ref) => budgets as BudgetsRepository,
        ),
        vaultRepositoryProvider.overrideWith(
          (ref) =>
              VaultRepositoryFake([
                    VaultFile(
                      id: 'file-receipt',
                      name: 'warung.jpg',
                      type: 'image/jpeg',
                      size: 482113,
                      usedBy: 1,
                      createdAt: DateTime(2026, 11, 5),
                    ),
                  ])
                  as VaultRepository,
        ),
      ],
    );
    _tester.view.physicalSize = const Size(1170, 2532);
    _tester.view.devicePixelRatio = 3;
    addTearDown(_tester.view.reset);
    // The whole shell is mounted, and the test font's metrics overflow its
    // fixed-height bars; layout is checked on the device, not here.
    final report = FlutterError.onError;
    FlutterError.onError = (details) {
      if ('${details.exception}'.contains('overflowed')) return;
      report?.call(details);
    };
    addTearDown(() => FlutterError.onError = report);
    addTearDown(container.dispose);
    router = container.read(appRouterProvider);
    await _tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(theme: AppTheme.dark(), routerConfig: router),
      ),
    );
    await _tester.pumpAndSettle();
  }

  /// What a tapped push does: the API's route, mapped and opened.
  Future<void> tap(String route) async {
    router.go(pushLocation(route));
    await _tester.pumpAndSettle();
  }

  String get location =>
      router.routerDelegate.currentConfiguration.uri.toString();
}

void main() {
  group('PUSH-5 a tapped push opens the item it names', () {
    testWidgets("a receipt push opens that transaction's form", (tester) async {
      final h = _Harness(tester);
      await h.pump();

      await h.tap('/transactions?detail=tx-receipt');

      expect(find.byType(TransactionFormScreen), findsOneWidget);
      expect(find.text('Warung Made'), findsWidgets);
      // `detail` is spent, so the same push opens it again.
      h.router.pop();
      await tester.pumpAndSettle();
      expect(h.location, AppRoutes.trans);
      await h.tap('/transactions?detail=tx-receipt');
      expect(find.byType(TransactionFormScreen), findsOneWidget);
    });

    testWidgets('a deleted transaction says so and stays on the list', (
      tester,
    ) async {
      final h = _Harness(tester);
      await h.pump();

      await h.tap('/transactions?detail=tx-gone');

      expect(find.byType(TransactionFormScreen), findsNothing);
      expect(find.byType(TransactionsScreen), findsOneWidget);
      expect(
        find.text('That transaction was deleted or no longer exists.'),
        findsOneWidget,
      );
    });

    testWidgets('a viewer stays on the list', (tester) async {
      final h = _Harness(tester, role: 'viewer');
      await h.pump();

      await h.tap('/transactions?detail=tx-receipt');

      expect(find.byType(TransactionFormScreen), findsNothing);
      expect(find.byType(TransactionsScreen), findsOneWidget);
    });

    testWidgets('a cold start holds the push across the splash', (
      tester,
    ) async {
      final h = _Harness(tester, loading: true);
      await h.pump();

      await h.tap('/transactions?detail=tx-receipt');
      expect(h.location, startsWith(AppRoutes.splash));

      h.session.resolve();
      await tester.pumpAndSettle();

      expect(find.byType(TransactionFormScreen), findsOneWidget);
    });

    testWidgets("a failed receipt push opens that file's sheet", (
      tester,
    ) async {
      final h = _Harness(tester);
      await h.pump();

      await h.tap('/vault?file=file-receipt');

      expect(find.byType(VaultScreen), findsOneWidget);
      expect(find.text('Open or share'), findsOneWidget);
      expect(h.location, AppRoutes.vault);
    });

    testWidgets('a deleted file says so', (tester) async {
      final h = _Harness(tester);
      await h.pump();

      await h.tap('/vault?file=file-gone');

      expect(find.text('Open or share'), findsNothing);
      expect(
        find.text('That file was deleted or no longer exists.'),
        findsOneWidget,
      );
    });

    testWidgets('a budget push shows the month it names', (tester) async {
      final h = _Harness(tester);
      await h.pump();

      await h.tap('/budgets?month=2026-10');

      expect(find.text('Budget, Oct 2026'), findsOneWidget);
      expect(h.budgets.asked, (month: 10, year: 2026));
    });
  });
}
