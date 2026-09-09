import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/budgets_repository.dart';
import 'package:oewang/data/repositories/debts_repository.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/repositories_remote/budgets_repository_offline.dart';
import 'package:oewang/data/repositories_remote/debts_repository_offline.dart';
import 'package:oewang/data/repositories_remote/transactions_repository_offline.dart';
import 'package:oewang/data/repositories_remote/wallets_repository_offline.dart';
import 'package:oewang/data/services/connectivity/connectivity_service.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/data/services/sync/sync_service.dart';
import 'package:oewang/domain/models/budget_status.dart';
import 'package:oewang/domain/models/debt.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/new_transaction_draft.dart';
import 'package:oewang/domain/models/transaction.dart';
import 'package:oewang/domain/models/wallet.dart';

class RemoteTransactions extends Mock implements TransactionsRepository {}

class RemoteWallets extends Mock implements WalletsRepository {}

class RemoteDebts extends Mock implements DebtsRepository {}

class RemoteBudgets extends Mock implements BudgetsRepository {}

class Connectivity extends Mock implements ConnectivityService {}

class Sync extends Mock implements SyncService {}

void main() {
  late AppDatabase db;
  late RemoteTransactions remote;
  late Connectivity connectivity;
  late Sync sync;
  late TransactionsRepositoryOffline repo;
  var workspace = 'ws1';
  final query = TransactionsListQuery(
    from: DateTime(2026, 1, 1),
    to: DateTime(2026, 1, 31),
  );
  NewTransactionDraft draft({num amount = 10, DateTime? date}) =>
      NewTransactionDraft(
        type: TransactionType.expense,
        amount: amount,
        date: date ?? DateTime(2026, 1, 5),
        walletId: 'w',
      );
  setUp(() {
    workspace = 'ws1';
    db = AppDatabase.withExecutor(NativeDatabase.memory());
    remote = RemoteTransactions();
    connectivity = Connectivity();
    sync = Sync();
    registerFallbackValue(query);
    when(() => connectivity.isOnline()).thenAnswer((_) async => false);
    when(
      () => remote.list(any()),
    ).thenAnswer((_) async => const Failure(NetworkError()));
    repo = TransactionsRepositoryOffline(
      remote: remote,
      db: db,
      connectivity: connectivity,
      sync: sync,
      workspaceId: () => workspace,
    );
  });
  tearDown(() => db.close());

  test(
    'should persist a create and its latest edit when the network is unavailable',
    () async {
      final created =
          (await repo.create(draft()) as Success<Transaction, AppError>).value;
      expect(created.id, matches(RegExp(r'^[a-z][a-z0-9]{23}$')));
      await repo.update(created.id, draft(amount: 25));
      final row = await db.select(db.cachedTransactions).getSingle();
      expect(row.pendingOp, kPendingOpCreate);
      expect(row.revision, 1);
      expect(row.amount, 25);
      final rows =
          (await repo.list(query) as Success<List<Transaction>, AppError>)
              .value;
      expect(rows.single.amount.amount, 25);
      verifyNever(() => sync.flush());
    },
  );

  test('should hide another workspace cache when offline', () async {
    await repo.create(draft());
    workspace = 'ws2';
    expect(
      (await repo.list(query) as Success<List<Transaction>, AppError>).value,
      isEmpty,
    );
  });

  test(
    'should not show a stale server row when a local edit moves it out of the date filter',
    () async {
      final created =
          (await repo.create(draft()) as Success<Transaction, AppError>).value;
      when(
        () => remote.list(any()),
      ).thenAnswer((_) async => Success([created]));
      await repo.update(created.id, draft(date: DateTime(2026, 2, 1)));
      expect(
        (await repo.list(query) as Success<List<Transaction>, AppError>).value,
        isEmpty,
      );
      expect(
        (await db.select(db.cachedTransactions).getSingle()).date.month,
        2,
      );
    },
  );

  test(
    'should surface authorization failure instead of returning cached financial data',
    () async {
      await repo.create(draft());
      when(
        () => remote.list(any()),
      ).thenAnswer((_) async => const Failure(UnauthorizedError()));
      expect(
        await repo.list(query),
        isA<Failure<List<Transaction>, AppError>>(),
      );
    },
  );

  test('should discard a late response when the workspace changes', () async {
    final reply = Completer<Result<List<Transaction>, AppError>>();
    when(() => remote.list(any())).thenAnswer((_) => reply.future);
    final request = repo.list(query);
    workspace = 'ws2';
    reply.complete(
      Success([
        Transaction(
          id: 'old',
          type: TransactionType.expense,
          amount: const Money(amount: 10),
          date: DateTime(2026),
          walletId: 'w',
        ),
      ]),
    );
    expect(await request, isA<Failure<List<Transaction>, AppError>>());
    expect(await db.select(db.cachedTransactions).get(), isEmpty);
  });

  test(
    'should queue wallet edits without replacing a pending create',
    () async {
      final remoteWallets = RemoteWallets();
      final wallets = WalletsRepositoryOffline(
        remote: remoteWallets,
        db: db,
        connectivity: connectivity,
        sync: sync,
        workspaceId: () => workspace,
      );
      final created =
          (await wallets.create(const NewWalletDraft(name: 'Cash', balance: 10))
                  as Success<Wallet, AppError>)
              .value;
      await wallets.update(
        created.id,
        const NewWalletDraft(name: 'Savings', balance: 20),
      );
      final row = await db.select(db.cachedWallets).getSingle();
      expect(row.name, 'Savings');
      expect(row.balance, 20);
      expect(row.pendingOp, kPendingOpCreate);
      expect(row.revision, 1);
    },
  );

  test(
    'should queue debt edits with the original client id and remaining amount',
    () async {
      final debts = DebtsRepositoryOffline(
        remote: RemoteDebts(),
        db: db,
        connectivity: connectivity,
        sync: sync,
        workspaceId: () => workspace,
      );
      await debts.create(contactId: 'c', type: DebtType.payable, amount: 10);
      final created = await db.select(db.cachedDebts).getSingle();
      await debts.update(id: created.id, amount: 20);
      final row = await db.select(db.cachedDebts).getSingle();
      expect(row.id, created.id);
      expect(row.remainingAmount, 20);
      expect(row.pendingOp, kPendingOpCreate);
      expect(row.revision, 1);
    },
  );

  test(
    'should scope budget snapshots by month and workspace when offline',
    () async {
      final budgetRemote = RemoteBudgets();
      final budgets = BudgetsRepositoryOffline(
        remote: budgetRemote,
        db: db,
        workspaceId: () => workspace,
      );
      const status = BudgetStatus(
        id: 'b',
        categoryId: 'c',
        categoryName: 'Food',
        amount: Money(amount: 100),
        spent: Money(amount: 40),
        percentage: 40,
      );
      when(
        () => budgetRemote.status(month: 1, year: 2026),
      ).thenAnswer((_) async => const Success([status]));
      await budgets.status(month: 1, year: 2026);
      when(
        () => budgetRemote.status(
          month: any(named: 'month'),
          year: any(named: 'year'),
        ),
      ).thenAnswer((_) async => const Failure(NetworkError()));
      expect(
        (await budgets.status(month: 1, year: 2026)
                as Success<List<BudgetStatus>, AppError>)
            .value,
        [status],
      );
      expect(
        (await budgets.status(month: 2, year: 2026)
                as Success<List<BudgetStatus>, AppError>)
            .value,
        isEmpty,
      );
      workspace = 'ws2';
      expect(
        (await budgets.status(month: 1, year: 2026)
                as Success<List<BudgetStatus>, AppError>)
            .value,
        isEmpty,
      );
    },
  );

  test(
    'should clear queued data and budget snapshots when logout wipes the cache',
    () async {
      await repo.create(draft());
      await db
          .into(db.cachedBudgetSnapshots)
          .insert(
            CachedBudgetSnapshotsCompanion.insert(
              workspaceId: 'ws1',
              month: 1,
              year: 2026,
              payload: '[]',
            ),
          );
      await db.clearAll();
      expect(await db.select(db.cachedTransactions).get(), isEmpty);
      expect(await db.select(db.cachedBudgetSnapshots).get(), isEmpty);
    },
  );
}
