import 'dart:async';

import 'package:cuid2/cuid2.dart';
import 'package:drift/drift.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/services/connectivity/connectivity_service.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/data/services/sync/sync_service.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/new_transaction_draft.dart';
import 'package:oewang/domain/models/transaction.dart';

/// Cache-then-network reads, write-to-cache-then-sync writes. `list()` falls
/// back to the local cache on a [NetworkError]; `create`/`update` always
/// return immediately from the cache and let [SyncService] push the change
/// out (right away if online, on the next connectivity/resume trigger if
/// not) — see docs/MOBILE plan for the full design.
class TransactionsRepositoryOffline implements TransactionsRepository {
  TransactionsRepositoryOffline({
    required TransactionsRepository remote,
    required AppDatabase db,
    required ConnectivityService connectivity,
    required SyncService sync,
    required String Function() workspaceId,
  }) : _remote = remote,
       _db = db,
       _connectivity = connectivity,
       _sync = sync,
       _workspaceId = workspaceId;

  final TransactionsRepository _remote;
  final AppDatabase _db;
  final ConnectivityService _connectivity;
  final SyncService _sync;
  final String Function() _workspaceId;

  @override
  Future<Result<List<Transaction>, AppError>> list(
    TransactionsListQuery query,
  ) async {
    final ws = _workspaceId();
    if (ws.isEmpty) return const Failure(UnauthorizedError());

    final remoteResult = await _remote.list(query);
    if (ws != _workspaceId()) return const Failure(UnauthorizedError());

    List<Transaction> base;
    if (remoteResult case Success<List<Transaction>, AppError>(
      value: final ok,
    )) {
      await _cacheRemoteTransactions(ws, ok, query);
      base = ok;
    } else if (remoteResult case Failure<List<Transaction>, AppError>(
      error: NetworkError(),
    )) {
      base = await _readCachedTransactions(ws, query);
    } else {
      return remoteResult; // non-network failure (e.g. 401 Unauthorized) — surface as-is
    }

    // Remove every locally dirty row from the server snapshot BEFORE applying
    // filters: an edit may have moved a transaction outside this date/type view.
    final dirtyIds =
        await (_db.select(
              _db.cachedTransactions,
            )..where((t) => t.workspaceId.equals(ws) & t.pendingOp.isNotNull()))
            .map((r) => r.id)
            .get();
    base = base.where((t) => !dirtyIds.contains(t.id)).toList();
    final freshPending = await _readPendingTransactions(ws, query);
    final merged = _mergeById(base, freshPending)
      ..sort((a, b) => b.date.compareTo(a.date));
    return Success(merged);
  }

  @override
  Future<Result<Transaction, AppError>> create(
    NewTransactionDraft draft,
  ) async {
    final ws = _workspaceId();
    if (ws.isEmpty) return const Failure(UnauthorizedError());
    final id = cuid();
    final walletName = await _lookupWalletName(draft.walletId);
    final toWalletName = draft.toWalletId != null
        ? await _lookupWalletName(draft.toWalletId!)
        : null;
    final categoryName = draft.categoryId != null
        ? await _lookupCategoryName(draft.categoryId!)
        : null;

    await _db
        .into(_db.cachedTransactions)
        .insert(
          CachedTransactionsCompanion.insert(
            id: id,
            workspaceId: ws,
            type: draft.type.wire,
            amount: draft.amount.toDouble(),
            date: draft.date,
            walletId: draft.walletId,
            walletName: Value(walletName),
            toWalletId: Value(draft.toWalletId),
            toWalletName: Value(toWalletName),
            categoryId: Value(draft.categoryId),
            categoryName: Value(categoryName),
            name: Value(draft.note),
            description: Value(draft.description),
            attachmentIds: Value(draft.attachmentIds?.join(',')),
            pendingOp: const Value(kPendingOpCreate),
            dirtySince: Value(DateTime.now()),
          ),
        );

    _maybeFlush();

    return Success(
      _draftToTransaction(
        id: id,
        draft: draft,
        walletName: walletName,
        toWalletName: toWalletName,
        categoryName: categoryName,
      ),
    );
  }

  @override
  Future<Result<Transaction, AppError>> update(
    String id,
    NewTransactionDraft draft,
  ) async {
    final ws = _workspaceId();
    if (ws.isEmpty) return const Failure(UnauthorizedError());
    final existing =
        await (_db.select(_db.cachedTransactions)..where(
              (t) => t.id.equals(id) & t.workspaceId.equals(_workspaceId()),
            ))
            .getSingleOrNull();
    final walletName = await _lookupWalletName(draft.walletId);
    final toWalletName = draft.toWalletId != null
        ? await _lookupWalletName(draft.toWalletId!)
        : null;
    final categoryName = draft.categoryId != null
        ? await _lookupCategoryName(draft.categoryId!)
        : null;
    // A never-synced local create stays `create` — the sync flush hasn't
    // seen it yet, so there's nothing to PUT an update against.
    if (existing == null) return _remote.update(id, draft);
    final keepCreate = existing.pendingOp == kPendingOpCreate;

    await _db
        .into(_db.cachedTransactions)
        .insertOnConflictUpdate(
          CachedTransactionsCompanion.insert(
            id: id,
            workspaceId: ws,
            type: draft.type.wire,
            amount: draft.amount.toDouble(),
            date: draft.date,
            walletId: draft.walletId,
            walletName: Value(walletName),
            toWalletId: Value(draft.toWalletId),
            toWalletName: Value(toWalletName),
            categoryId: Value(draft.categoryId),
            categoryName: Value(categoryName),
            name: Value(draft.note),
            description: Value(draft.description),
            attachmentIds: Value(draft.attachmentIds?.join(',')),
            pendingOp: Value(keepCreate ? kPendingOpCreate : kPendingOpUpdate),
            revision: Value(existing.revision + 1),
            syncError: const Value(null),
            attemptCount: const Value(0),
            lastAttemptAt: const Value(null),
            dirtySince: Value(DateTime.now()),
          ),
        );

    _maybeFlush();

    return Success(
      _draftToTransaction(
        id: id,
        draft: draft,
        walletName: walletName,
        toWalletName: toWalletName,
        categoryName: categoryName,
      ),
    );
  }

  Transaction _draftToTransaction({
    required String id,
    required NewTransactionDraft draft,
    required String? walletName,
    required String? toWalletName,
    required String? categoryName,
  }) => Transaction(
    id: id,
    type: draft.type,
    amount: Money(amount: draft.amount),
    date: DateTime(draft.date.year, draft.date.month, draft.date.day),
    walletId: draft.walletId,
    toWalletId: draft.toWalletId,
    categoryId: draft.categoryId,
    name: draft.note,
    description: draft.description,
    wallet: walletName != null
        ? NamedRef(id: draft.walletId, name: walletName)
        : null,
    toWallet: draft.toWalletId != null && toWalletName != null
        ? NamedRef(id: draft.toWalletId!, name: toWalletName)
        : null,
    category: draft.categoryId != null && categoryName != null
        ? NamedRef(id: draft.categoryId!, name: categoryName)
        : null,
  );

  Future<String?> _lookupWalletName(String walletId) async {
    final row =
        await (_db.select(_db.cachedWallets)..where(
              (t) =>
                  t.id.equals(walletId) & t.workspaceId.equals(_workspaceId()),
            ))
            .getSingleOrNull();
    return row?.name;
  }

  Future<String?> _lookupCategoryName(String categoryId) async {
    final row =
        await (_db.select(_db.cachedCategories)..where(
              (t) =>
                  t.id.equals(categoryId) &
                  t.workspaceId.equals(_workspaceId()),
            ))
            .getSingleOrNull();
    return row?.name;
  }

  Future<void> _cacheRemoteTransactions(
    String ws,
    List<Transaction> txs,
    TransactionsListQuery query,
  ) async {
    // Never clobber a row that's still mid-sync — the local edit is newer
    // than whatever the server just returned for it.
    await _db.transaction(() async {
      // Only reconcile a complete result window; a paginated response is not
      // evidence that records on another page were deleted.
      if (query.page == 1 && txs.length < query.limit) {
        await (_db.delete(_db.cachedTransactions)..where(
              (t) =>
                  t.workspaceId.equals(ws) &
                  t.pendingOp.isNull() &
                  t.date.isBiggerOrEqualValue(query.from) &
                  t.date.isSmallerOrEqualValue(query.to) &
                  (query.type == null
                      ? const Constant(true)
                      : t.type.equals(query.type!.wire)),
            ))
            .go();
      }
      final pendingIds =
          await (_db.select(_db.cachedTransactions)..where(
                (t) => t.workspaceId.equals(ws) & t.pendingOp.isNotNull(),
              ))
              .map((r) => r.id)
              .get();
      final pendingIdSet = pendingIds.toSet();

      await _db.batch((b) {
        for (final t in txs) {
          if (pendingIdSet.contains(t.id)) continue;
          b.insert(
            _db.cachedTransactions,
            CachedTransactionsCompanion.insert(
              id: t.id,
              workspaceId: ws,
              type: t.type.wire,
              amount: t.amount.amount.toDouble(),
              currency: Value(t.amount.currency),
              date: t.date,
              walletId: t.walletId,
              walletName: Value(t.wallet?.name),
              toWalletId: Value(t.toWalletId),
              toWalletName: Value(t.toWallet?.name),
              categoryId: Value(t.categoryId),
              categoryName: Value(t.category?.name),
              name: Value(t.name),
              description: Value(t.description),
            ),
            mode: InsertMode.insertOrReplace,
          );
        }
      });
    });
  }

  Future<List<Transaction>> _readCachedTransactions(
    String ws,
    TransactionsListQuery query,
  ) async {
    final rows =
        await (_db.select(_db.cachedTransactions)..where(
              (t) =>
                  t.workspaceId.equals(ws) &
                  t.date.isBiggerOrEqualValue(query.from) &
                  t.date.isSmallerOrEqualValue(query.to) &
                  (query.type == null
                      ? const Constant(true)
                      : t.type.equals(query.type!.wire)),
            ))
            .get();
    return rows.map(_rowToTransaction).toList();
  }

  Future<List<Transaction>> _readPendingTransactions(
    String ws,
    TransactionsListQuery query,
  ) async {
    final rows =
        await (_db.select(_db.cachedTransactions)..where(
              (t) =>
                  t.workspaceId.equals(ws) &
                  t.pendingOp.isNotNull() &
                  t.date.isBiggerOrEqualValue(query.from) &
                  t.date.isSmallerOrEqualValue(query.to) &
                  (query.type == null
                      ? const Constant(true)
                      : t.type.equals(query.type!.wire)),
            ))
            .get();
    return rows.map(_rowToTransaction).toList();
  }

  List<Transaction> _mergeById(
    List<Transaction> base,
    List<Transaction> pending,
  ) {
    final byId = {for (final t in base) t.id: t};
    for (final t in pending) {
      byId[t.id] = t;
    }
    return byId.values.toList();
  }

  Transaction _rowToTransaction(CachedTransaction row) => Transaction(
    id: row.id,
    type: TransactionType.fromWire(row.type),
    amount: Money(amount: row.amount, currency: row.currency),
    date: DateTime(row.date.year, row.date.month, row.date.day),
    walletId: row.walletId,
    toWalletId: row.toWalletId,
    categoryId: row.categoryId,
    name: row.name,
    description: row.description,
    wallet: row.walletName != null
        ? NamedRef(id: row.walletId, name: row.walletName!)
        : null,
    toWallet: row.toWalletId != null && row.toWalletName != null
        ? NamedRef(id: row.toWalletId!, name: row.toWalletName!)
        : null,
    category: row.categoryId != null && row.categoryName != null
        ? NamedRef(id: row.categoryId!, name: row.categoryName!)
        : null,
  );

  @override
  Future<Result<void, AppError>> delete(String id) async {
    final ws = _workspaceId();
    if (ws.isEmpty) return const Failure(UnauthorizedError());

    await (_db.delete(_db.cachedTransactions)..where(
      (t) => t.id.equals(id) & t.workspaceId.equals(ws),
    )).go();

    return _remote.delete(id);
  }

  void _maybeFlush() {
    unawaited(
      _connectivity.isOnline().then((online) {
        if (online) return _sync.flush();
        return null;
      }),
    );
  }
}
