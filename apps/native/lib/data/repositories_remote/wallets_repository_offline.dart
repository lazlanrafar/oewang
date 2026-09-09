import 'dart:async';

import 'package:cuid2/cuid2.dart';
import 'package:drift/drift.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/wallets_repository.dart';
import 'package:oewang/data/services/connectivity/connectivity_service.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/data/services/sync/sync_service.dart';
import 'package:oewang/domain/models/wallet.dart';

/// Same cache-then-network / write-then-sync shape as
/// [TransactionsRepositoryOffline] — see that file's doc comment. `delete`,
/// `reorder`, and `setIncludedInTotals` still require connectivity: they're
/// out of v1's offline-write scope (create/update only, per the approved
/// plan).
class WalletsRepositoryOffline implements WalletsRepository {
  WalletsRepositoryOffline({
    required WalletsRepository remote,
    required AppDatabase db,
    required ConnectivityService connectivity,
    required SyncService sync,
    required String Function() workspaceId,
  }) : _remote = remote,
       _db = db,
       _connectivity = connectivity,
       _sync = sync,
       _workspaceId = workspaceId;

  final WalletsRepository _remote;
  final AppDatabase _db;
  final ConnectivityService _connectivity;
  final SyncService _sync;
  final String Function() _workspaceId;

  @override
  Future<Result<List<Wallet>, AppError>> list() async {
    final ws = _workspaceId();
    if (ws.isEmpty) return const Failure(UnauthorizedError());
    final cachedBase = await _readCachedWallets(ws, pendingOnly: false);
    final remoteResult = await _remote.list();
    if (ws != _workspaceId()) return const Failure(UnauthorizedError());
    List<Wallet> base;
    if (remoteResult case Success<List<Wallet>, AppError>(value: final ok)) {
      await _cacheRemoteWallets(ws, ok);
      base = ok;
    } else if (cachedBase.isNotEmpty) {
      base = cachedBase;
    } else if (remoteResult case Failure<List<Wallet>, AppError>(
      error: NetworkError(),
    )) {
      base = cachedBase;
    } else {
      return remoteResult;
    }

    final pending = await _readCachedWallets(ws, pendingOnly: true);
    final byId = {for (final w in base) w.id: w};
    for (final w in pending) {
      byId[w.id] = w;
    }
    return Success(byId.values.toList());
  }

  @override
  Future<Result<Wallet, AppError>> create(NewWalletDraft draft) async {
    final ws = _workspaceId();
    if (ws.isEmpty) return const Failure(UnauthorizedError());
    final id = cuid();
    await _db
        .into(_db.cachedWallets)
        .insert(
          CachedWalletsCompanion.insert(
            id: id,
            workspaceId: ws,
            name: draft.name,
            groupId: Value(draft.groupId),
            balance: Value(draft.balance.toDouble()),
            pendingOp: const Value(kPendingOpCreate),
            dirtySince: Value(DateTime.now()),
          ),
        );
    _maybeFlush();
    return Success(
      Wallet(
        id: id,
        name: draft.name,
        groupId: draft.groupId,
        balance: draft.balance,
      ),
    );
  }

  @override
  Future<Result<Wallet, AppError>> update(
    String id,
    NewWalletDraft draft,
  ) async {
    final ws = _workspaceId();
    if (ws.isEmpty) return const Failure(UnauthorizedError());
    final existing =
        await (_db.select(_db.cachedWallets)..where(
              (t) => t.id.equals(id) & t.workspaceId.equals(_workspaceId()),
            ))
            .getSingleOrNull();
    if (existing == null) return _remote.update(id, draft);
    final keepCreate = existing.pendingOp == kPendingOpCreate;

    await _db
        .into(_db.cachedWallets)
        .insertOnConflictUpdate(
          CachedWalletsCompanion.insert(
            id: id,
            workspaceId: ws,
            name: draft.name,
            groupId: Value(draft.groupId),
            balance: Value(draft.balance.toDouble()),
            currency: Value(existing.currency),
            isIncludedInTotals: Value(existing.isIncludedInTotals),
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
      Wallet(
        id: id,
        name: draft.name,
        groupId: draft.groupId,
        balance: draft.balance,
      ),
    );
  }

  // Connectivity-required operations — unchanged, delegate straight through.
  @override
  Future<Result<void, AppError>> delete(String id) => _remote.delete(id);

  @override
  Future<Result<void, AppError>> reorder(
    List<String> orderedIds, {
    String? groupId,
  }) => _remote.reorder(orderedIds, groupId: groupId);

  @override
  Future<Result<void, AppError>> setIncludedInTotals(
    String id, {
    required bool included,
  }) => _remote.setIncludedInTotals(id, included: included);

  Future<void> _cacheRemoteWallets(String ws, List<Wallet> wallets) async {
    await _db.transaction(() async {
      if (wallets.length < 100) {
        await (_db.delete(
          _db.cachedWallets,
        )..where((t) => t.workspaceId.equals(ws) & t.pendingOp.isNull())).go();
      }
      final pendingIds =
          await (_db.select(_db.cachedWallets)..where(
                (t) => t.workspaceId.equals(ws) & t.pendingOp.isNotNull(),
              ))
              .map((r) => r.id)
              .get();
      final pendingIdSet = pendingIds.toSet();

      await _db.batch((b) {
        for (final w in wallets) {
          if (pendingIdSet.contains(w.id)) continue;
          b.insert(
            _db.cachedWallets,
            CachedWalletsCompanion.insert(
              id: w.id,
              workspaceId: ws,
              name: w.name,
              groupId: Value(w.groupId),
              balance: Value(w.balance.toDouble()),
              currency: Value(w.currency),
              isIncludedInTotals: Value(w.isIncludedInTotals),
            ),
            mode: InsertMode.insertOrReplace,
          );
        }
      });
    });
  }

  Future<List<Wallet>> _readCachedWallets(
    String ws, {
    required bool pendingOnly,
  }) async {
    final rows =
        await (_db.select(_db.cachedWallets)..where(
              (t) =>
                  t.workspaceId.equals(ws) &
                  (pendingOnly
                      ? t.pendingOp.isNotNull()
                      : const Constant(true)),
            ))
            .get();
    return rows
        .map(
          (r) => Wallet(
            id: r.id,
            name: r.name,
            groupId: r.groupId,
            balance: r.balance,
            currency: r.currency,
            isIncludedInTotals: r.isIncludedInTotals,
          ),
        )
        .toList();
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
