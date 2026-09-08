import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'app_database.g.dart';

/// `pendingOp` values on the three writable tables below. `null` means the
/// row is fully synced with the server.
const kPendingOpCreate = 'create';
const kPendingOpUpdate = 'update';

/// Local mirror of a transaction. Rows with a non-null [pendingOp] are
/// offline-created/edited and still owe the server a sync (see SyncService).
class CachedTransactions extends Table {
  TextColumn get id => text()();
  TextColumn get workspaceId => text()();
  TextColumn get type => text()();
  RealColumn get amount => real()();
  TextColumn get currency => text().withDefault(const Constant('IDR'))();
  DateTimeColumn get date => dateTime()();
  TextColumn get walletId => text()();
  TextColumn get walletName => text().nullable()();
  TextColumn get toWalletId => text().nullable()();
  TextColumn get toWalletName => text().nullable()();
  TextColumn get categoryId => text().nullable()();
  TextColumn get categoryName => text().nullable()();
  TextColumn get name => text().nullable()();
  TextColumn get description => text().nullable()();
  TextColumn get pendingOp => text().nullable()();
  DateTimeColumn get dirtySince => dateTime().nullable()();
  TextColumn get syncError => text().nullable()();
  IntColumn get attemptCount => integer().withDefault(const Constant(0))();
  DateTimeColumn get lastAttemptAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Local mirror of a wallet. Same offline-write shape as [CachedTransactions].
class CachedWallets extends Table {
  TextColumn get id => text()();
  TextColumn get workspaceId => text()();
  TextColumn get name => text()();
  TextColumn get groupId => text().nullable()();
  RealColumn get balance => real().withDefault(const Constant(0))();
  TextColumn get currency => text().withDefault(const Constant('IDR'))();
  BoolColumn get isIncludedInTotals =>
      boolean().withDefault(const Constant(true))();
  TextColumn get pendingOp => text().nullable()();
  DateTimeColumn get dirtySince => dateTime().nullable()();
  TextColumn get syncError => text().nullable()();
  IntColumn get attemptCount => integer().withDefault(const Constant(0))();
  DateTimeColumn get lastAttemptAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Local mirror of a debt. Same offline-write shape as [CachedTransactions].
class CachedDebts extends Table {
  TextColumn get id => text()();
  TextColumn get workspaceId => text()();
  TextColumn get contactId => text()();
  TextColumn get contactName => text().nullable()();
  TextColumn get type => text()();
  RealColumn get amount => real()();
  RealColumn get remainingAmount => real()();
  TextColumn get currency => text().withDefault(const Constant('IDR'))();
  TextColumn get status => text().withDefault(const Constant('unpaid'))();
  TextColumn get description => text().nullable()();
  DateTimeColumn get dueDate => dateTime().nullable()();
  TextColumn get pendingOp => text().nullable()();
  DateTimeColumn get dirtySince => dateTime().nullable()();
  TextColumn get syncError => text().nullable()();
  IntColumn get attemptCount => integer().withDefault(const Constant(0))();
  DateTimeColumn get lastAttemptAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Read-only mirror refreshed on every successful `/categories` fetch — just
/// enough to populate the transaction form's category picker offline.
class CachedCategories extends Table {
  TextColumn get id => text()();
  TextColumn get workspaceId => text()();
  TextColumn get name => text()();
  TextColumn get type => text()();
  TextColumn get emoji => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Read-only mirror refreshed on every successful `/contacts` fetch — just
/// enough to populate the debt form's contact picker offline, and to resolve
/// `contactName` for an offline-created debt before it syncs.
class CachedContacts extends Table {
  TextColumn get id => text()();
  TextColumn get workspaceId => text()();
  TextColumn get name => text()();

  @override
  Set<Column> get primaryKey => {id};
}

@DriftDatabase(
  tables: [
    CachedTransactions,
    CachedWallets,
    CachedDebts,
    CachedCategories,
    CachedContacts,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  /// For tests — pass an in-memory `NativeDatabase.memory()` executor.
  AppDatabase.withExecutor(super.executor);

  @override
  int get schemaVersion => 1;

  static QueryExecutor _openConnection() =>
      driftDatabase(name: 'oewang_cache');

  Stream<int> watchPendingTransactionsCount(String workspaceId) =>
      (select(cachedTransactions)..where(
            (t) => t.workspaceId.equals(workspaceId) & t.pendingOp.isNotNull(),
          ))
          .watch()
          .map((rows) => rows.length);

  Stream<int> watchPendingWalletsCount(String workspaceId) =>
      (select(cachedWallets)..where(
            (t) => t.workspaceId.equals(workspaceId) & t.pendingOp.isNotNull(),
          ))
          .watch()
          .map((rows) => rows.length);

  Stream<int> watchPendingDebtsCount(String workspaceId) =>
      (select(cachedDebts)..where(
            (t) => t.workspaceId.equals(workspaceId) & t.pendingOp.isNotNull(),
          ))
          .watch()
          .map((rows) => rows.length);

  /// Wipes every cached table — called on logout so a shared device never
  /// carries one account's financial data into the next session.
  Future<void> clearAll() async {
    await batch((b) {
      b
        ..deleteWhere(cachedTransactions, (_) => const Constant(true))
        ..deleteWhere(cachedWallets, (_) => const Constant(true))
        ..deleteWhere(cachedDebts, (_) => const Constant(true))
        ..deleteWhere(cachedCategories, (_) => const Constant(true))
        ..deleteWhere(cachedContacts, (_) => const Constant(true));
    });
  }
}
