import 'dart:async';

import 'package:cuid2/cuid2.dart';
import 'package:drift/drift.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/debts_repository.dart';
import 'package:oewang/data/services/connectivity/connectivity_service.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/data/services/sync/sync_service.dart';
import 'package:oewang/domain/models/debt.dart';
import 'package:oewang/domain/models/money.dart';

/// Same cache-then-network / write-then-sync shape as
/// [TransactionsRepositoryOffline]. `delete` and `pay` still require
/// connectivity — out of v1's offline-write scope (create/update only).
class DebtsRepositoryOffline implements DebtsRepository {
  DebtsRepositoryOffline({
    required DebtsRepository remote,
    required AppDatabase db,
    required ConnectivityService connectivity,
    required SyncService sync,
    required String Function() workspaceId,
  }) : _remote = remote,
       _db = db,
       _connectivity = connectivity,
       _sync = sync,
       _workspaceId = workspaceId;

  final DebtsRepository _remote;
  final AppDatabase _db;
  final ConnectivityService _connectivity;
  final SyncService _sync;
  final String Function() _workspaceId;

  @override
  Future<Result<List<Debt>, AppError>> list({String? search}) async {
    final ws = _workspaceId();
    if (ws.isEmpty) return const Failure(UnauthorizedError());
    final cachedBase = await _readCachedDebts(ws, pendingOnly: false);
    final remoteResult = await _remote.list(search: search);
    if (ws != _workspaceId()) return const Failure(UnauthorizedError());
    List<Debt> base;
    if (remoteResult case Success<List<Debt>, AppError>(value: final ok)) {
      await _cacheRemoteDebts(ws, ok, search);
      base = ok;
    } else if (cachedBase.isNotEmpty) {
      base = cachedBase;
    } else if (remoteResult case Failure<List<Debt>, AppError>(
      error: NetworkError(),
    )) {
      base = cachedBase;
    } else {
      return remoteResult;
    }

    final pending = await _readCachedDebts(ws, pendingOnly: true);
    final byId = {for (final d in base) d.id: d};
    for (final d in pending) {
      byId[d.id] = d;
    }
    var result = byId.values.toList();
    if (search != null && search.isNotEmpty) {
      final q = search.toLowerCase();
      result = result
          .where((d) => d.contactName.toLowerCase().contains(q))
          .toList();
    }
    return Success(result);
  }

  @override
  Future<Result<void, AppError>> create({
    required String contactId,
    required DebtType type,
    required num amount,
    String? description,
    DateTime? dueDate,
  }) async {
    final ws = _workspaceId();
    if (ws.isEmpty) return const Failure(UnauthorizedError());
    final contactName = await _lookupContactName(contactId);
    await _db
        .into(_db.cachedDebts)
        .insert(
          CachedDebtsCompanion.insert(
            id: cuid(),
            workspaceId: ws,
            contactId: contactId,
            contactName: Value(contactName),
            type: type.wire,
            amount: amount.toDouble(),
            remainingAmount: amount.toDouble(),
            description: Value(description),
            dueDate: Value(dueDate),
            pendingOp: const Value(kPendingOpCreate),
            dirtySince: Value(DateTime.now()),
          ),
        );
    _maybeFlush();
    return const Success(null);
  }

  @override
  Future<Result<void, AppError>> update({
    required String id,
    num? amount,
    String? description,
    DateTime? dueDate,
  }) async {
    final existing =
        await (_db.select(_db.cachedDebts)..where(
              (t) => t.id.equals(id) & t.workspaceId.equals(_workspaceId()),
            ))
            .getSingleOrNull();
    if (existing == null) {
      // Not cached locally (e.g. never listed while online) — nothing to
      // optimistically edit; require connectivity for this one.
      return _remote.update(
        id: id,
        amount: amount,
        description: description,
        dueDate: dueDate,
      );
    }

    final newAmount = (amount ?? existing.amount).toDouble();
    final amountDiff = newAmount - existing.amount;
    final keepCreate = existing.pendingOp == kPendingOpCreate;

    await (_db.update(
          _db.cachedDebts,
        )..where((t) => t.id.equals(id) & t.workspaceId.equals(_workspaceId())))
        .write(
          CachedDebtsCompanion(
            amount: Value(newAmount),
            remainingAmount: Value(
              (existing.remainingAmount + amountDiff).clamp(0, double.infinity),
            ),
            status: Value(
              existing.remainingAmount + amountDiff <= 0
                  ? 'paid'
                  : existing.remainingAmount + amountDiff < newAmount
                  ? 'partial'
                  : 'unpaid',
            ),
            description: description != null
                ? Value(description)
                : const Value.absent(),
            dueDate: dueDate != null ? Value(dueDate) : const Value.absent(),
            pendingOp: Value(keepCreate ? kPendingOpCreate : kPendingOpUpdate),
            revision: Value(existing.revision + 1),
            syncError: const Value(null),
            attemptCount: const Value(0),
            lastAttemptAt: const Value(null),
            dirtySince: Value(DateTime.now()),
          ),
        );
    _maybeFlush();
    return const Success(null);
  }

  // Connectivity-required operations — unchanged, delegate straight through.
  @override
  Future<Result<void, AppError>> delete(String id) => _remote.delete(id);

  @override
  Future<Result<void, AppError>> pay({
    required String id,
    required num amount,
    String? walletId,
  }) => _remote.pay(id: id, amount: amount, walletId: walletId);

  Future<String?> _lookupContactName(String contactId) async {
    final row =
        await (_db.select(_db.cachedContacts)..where(
              (t) =>
                  t.id.equals(contactId) & t.workspaceId.equals(_workspaceId()),
            ))
            .getSingleOrNull();
    return row?.name;
  }

  Future<void> _cacheRemoteDebts(
    String ws,
    List<Debt> debts,
    String? search,
  ) async {
    await _db.transaction(() async {
      if ((search == null || search.isEmpty) && debts.length < 100) {
        await (_db.delete(
          _db.cachedDebts,
        )..where((t) => t.workspaceId.equals(ws) & t.pendingOp.isNull())).go();
      }
      final pendingIds =
          await (_db.select(_db.cachedDebts)..where(
                (t) => t.workspaceId.equals(ws) & t.pendingOp.isNotNull(),
              ))
              .map((r) => r.id)
              .get();
      final pendingIdSet = pendingIds.toSet();

      await _db.batch((b) {
        for (final d in debts) {
          if (pendingIdSet.contains(d.id)) continue;
          b.insert(
            _db.cachedDebts,
            CachedDebtsCompanion.insert(
              id: d.id,
              workspaceId: ws,
              contactId: d.contactId,
              contactName: Value(d.contactName),
              type: d.type.wire,
              amount: d.amount.amount.toDouble(),
              remainingAmount: d.remainingAmount.amount.toDouble(),
              currency: Value(d.amount.currency),
              status: Value(_statusWire(d.status)),
              description: Value(d.description),
              dueDate: Value(d.dueDate),
            ),
            mode: InsertMode.insertOrReplace,
          );
        }
      });
    });
  }

  Future<List<Debt>> _readCachedDebts(
    String ws, {
    required bool pendingOnly,
  }) async {
    final rows =
        await (_db.select(_db.cachedDebts)..where(
              (t) =>
                  t.workspaceId.equals(ws) &
                  (pendingOnly
                      ? t.pendingOp.isNotNull()
                      : const Constant(true)),
            ))
            .get();
    return rows
        .map(
          (r) => Debt(
            id: r.id,
            contactId: r.contactId,
            contactName: r.contactName ?? '',
            type: DebtType.fromWire(r.type),
            amount: Money(amount: r.amount, currency: r.currency),
            remainingAmount: Money(
              amount: r.remainingAmount,
              currency: r.currency,
            ),
            status: DebtStatus.fromWire(r.status),
            description: r.description,
            dueDate: r.dueDate,
          ),
        )
        .toList();
  }

  String _statusWire(DebtStatus status) => switch (status) {
    DebtStatus.paid => 'paid',
    DebtStatus.partial => 'partial',
    DebtStatus.unpaid => 'unpaid',
  };

  void _maybeFlush() {
    unawaited(
      _connectivity.isOnline().then((online) {
        if (online) return _sync.flush();
        return null;
      }),
    );
  }
}
