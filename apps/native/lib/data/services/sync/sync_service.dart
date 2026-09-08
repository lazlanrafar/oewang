import 'dart:async';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart';
import 'package:oewang/core/logging/app_logger.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/db/app_database.dart';

final _log = createLogger('sync');

/// Flushes every offline-queued transaction/wallet/debt write to the server.
///
/// Triggered by [ConnectivityService.onOnline], app-resume, and immediately
/// (fire-and-forget) after an online create/update — see the `*Offline`
/// repositories. Foreground-only: there's no OS background task here, so a
/// killed app simply resumes the flush next time it's opened (ponytail: the
/// app isn't asked to sync while fully killed — add WorkManager/BGTaskScheduler
/// if that's ever required).
class SyncService {
  SyncService({
    required AppDatabase db,
    required ApiClient api,
    required String Function() workspaceId,
  }) : _db = db,
       _api = api,
       _workspaceId = workspaceId;

  final AppDatabase _db;
  final ApiClient _api;
  // Read fresh on every flush — a device shared across accounts must never
  // push a row queued under a previous session's workspace using the
  // current session's auth token.
  final String Function() _workspaceId;

  static const _batchSize = 50;
  bool _running = false;

  /// Backs off retries so a stuck row doesn't hot-loop: 5s, 10s, 20s, ... capped
  /// at 5 minutes.
  bool _dueForRetry(DateTime? lastAttemptAt, int attemptCount) {
    if (lastAttemptAt == null) return true;
    final backoff = Duration(
      seconds: min(5 * pow(2, attemptCount).toInt(), 300),
    );
    return DateTime.now().difference(lastAttemptAt) >= backoff;
  }

  Future<void> flush() async {
    if (_running) return; // one flush at a time is enough
    _running = true;
    try {
      await _flushTransactions();
      await _flushWallets();
      await _flushDebts();
    } finally {
      _running = false;
    }
  }

  // ── Transactions ─────────────────────────────────────────────────────────

  Future<void> _flushTransactions() async {
    final ws = _workspaceId();
    final rows =
        await (_db.select(_db.cachedTransactions)
              ..where((t) => t.workspaceId.equals(ws) & t.pendingOp.isNotNull())
              ..orderBy([(t) => OrderingTerm.asc(t.dirtySince)]))
            .get();
    final due = rows
        .where((r) => _dueForRetry(r.lastAttemptAt, r.attemptCount))
        .toList();
    if (due.isEmpty) return;

    final creates = due.where((r) => r.pendingOp == kPendingOpCreate).toList();
    final updates = due.where((r) => r.pendingOp == kPendingOpUpdate).toList();

    for (var i = 0; i < creates.length; i += _batchSize) {
      final chunk = creates.sublist(
        i,
        min(i + _batchSize, creates.length),
      );
      await _flushTransactionCreateBatch(chunk);
    }

    for (final row in updates) {
      await _flushTransactionUpdate(row);
    }
  }

  Future<void> _flushTransactionCreateBatch(
    List<CachedTransaction> chunk,
  ) async {
    await _db.batch((b) {
      for (final row in chunk) {
        b.update(
          _db.cachedTransactions,
          CachedTransactionsCompanion(
            lastAttemptAt: Value(DateTime.now()),
          ),
          where: (t) => t.id.equals(row.id),
        );
      }
    });

    try {
      final res = await _api.post(
        '/transactions/bulk',
        data: chunk.map(_transactionWireBody).toList(),
      );
      final data = (res.data as Map<String, dynamic>)['data'];
      final synced = <String>{};
      if (data is Map<String, dynamic>) {
        final txs = data['transactions'];
        if (txs is List) {
          for (final t in txs) {
            if (t is Map<String, dynamic> && t['id'] is String) {
              synced.add(t['id'] as String);
            }
          }
        }
      }
      final failuresByIndex = <int, String>{};
      if (data is Map<String, dynamic> && data['failures'] is List) {
        for (final f in data['failures'] as List) {
          if (f is Map<String, dynamic> &&
              f['index'] is int &&
              f['reason'] is String) {
            failuresByIndex[f['index'] as int] = f['reason'] as String;
          }
        }
      }

      await _db.batch((b) {
        for (var i = 0; i < chunk.length; i++) {
          final row = chunk[i];
          if (synced.contains(row.id)) {
            b.update(
              _db.cachedTransactions,
              const CachedTransactionsCompanion(
                pendingOp: Value(null),
                dirtySince: Value(null),
                syncError: Value(null),
                attemptCount: Value(0),
              ),
              where: (t) => t.id.equals(row.id),
            );
          } else {
            final reason = failuresByIndex[i] ?? 'Sync failed';
            b.update(
              _db.cachedTransactions,
              CachedTransactionsCompanion(
                syncError: Value(reason),
                attemptCount: Value(row.attemptCount + 1),
              ),
              where: (t) => t.id.equals(row.id),
            );
          }
        }
      });
    } on DioException catch (e) {
      _log.warn('transaction batch sync failed', {'error': e.message});
      await _db.batch((b) {
        for (final row in chunk) {
          b.update(
            _db.cachedTransactions,
            CachedTransactionsCompanion(
              syncError: const Value('Network error'),
              attemptCount: Value(row.attemptCount + 1),
            ),
            where: (t) => t.id.equals(row.id),
          );
        }
      });
    }
  }

  Future<void> _flushTransactionUpdate(CachedTransaction row) async {
    await (_db.update(_db.cachedTransactions)..where((t) => t.id.equals(row.id)))
        .write(CachedTransactionsCompanion(lastAttemptAt: Value(DateTime.now())));
    try {
      final body = _transactionWireBody(row)..remove('id');
      await _api.put('/transactions/${row.id}', data: body);
      await (_db.update(
        _db.cachedTransactions,
      )..where((t) => t.id.equals(row.id))).write(
        const CachedTransactionsCompanion(
          pendingOp: Value(null),
          dirtySince: Value(null),
          syncError: Value(null),
          attemptCount: Value(0),
        ),
      );
    } on DioException catch (e) {
      _log.warn('transaction update sync failed', {'error': e.message});
      await (_db.update(
        _db.cachedTransactions,
      )..where((t) => t.id.equals(row.id))).write(
        CachedTransactionsCompanion(
          syncError: Value(e.message ?? 'Sync failed'),
          attemptCount: Value(row.attemptCount + 1),
        ),
      );
    }
  }

  Map<String, dynamic> _transactionWireBody(CachedTransaction row) => {
    'id': row.id,
    'walletId': row.walletId,
    if (row.toWalletId != null) 'toWalletId': row.toWalletId,
    if (row.categoryId != null) 'categoryId': row.categoryId,
    'amount': row.amount,
    'date':
        '${row.date.year.toString().padLeft(4, '0')}-'
        '${row.date.month.toString().padLeft(2, '0')}-'
        '${row.date.day.toString().padLeft(2, '0')}',
    'type': row.type,
    if (row.name != null) 'name': row.name,
    if (row.description != null) 'description': row.description,
  };

  // ── Wallets ──────────────────────────────────────────────────────────────

  Future<void> _flushWallets() async {
    final ws = _workspaceId();
    final rows =
        await (_db.select(_db.cachedWallets)
              ..where((t) => t.workspaceId.equals(ws) & t.pendingOp.isNotNull())
              ..orderBy([(t) => OrderingTerm.asc(t.dirtySince)]))
            .get();
    for (final row in rows) {
      if (!_dueForRetry(row.lastAttemptAt, row.attemptCount)) continue;
      await _flushWallet(row);
    }
  }

  Future<void> _flushWallet(CachedWallet row) async {
    await (_db.update(_db.cachedWallets)..where((t) => t.id.equals(row.id)))
        .write(CachedWalletsCompanion(lastAttemptAt: Value(DateTime.now())));
    try {
      final body = {
        'id': row.id,
        'name': row.name,
        if (row.groupId != null) 'groupId': row.groupId,
        'balance': row.balance.toString(),
        'isIncludedInTotals': row.isIncludedInTotals,
      };
      if (row.pendingOp == kPendingOpCreate) {
        await _api.post('/wallets', data: body);
      } else {
        await _api.put('/wallets/${row.id}', data: body..remove('id'));
      }
      await (_db.update(_db.cachedWallets)..where((t) => t.id.equals(row.id)))
          .write(
            const CachedWalletsCompanion(
              pendingOp: Value(null),
              dirtySince: Value(null),
              syncError: Value(null),
              attemptCount: Value(0),
            ),
          );
    } on DioException catch (e) {
      _log.warn('wallet sync failed', {'error': e.message});
      await (_db.update(_db.cachedWallets)..where((t) => t.id.equals(row.id)))
          .write(
            CachedWalletsCompanion(
              syncError: Value(e.message ?? 'Sync failed'),
              attemptCount: Value(row.attemptCount + 1),
            ),
          );
    }
  }

  // ── Debts ────────────────────────────────────────────────────────────────

  Future<void> _flushDebts() async {
    final ws = _workspaceId();
    final rows =
        await (_db.select(_db.cachedDebts)
              ..where((t) => t.workspaceId.equals(ws) & t.pendingOp.isNotNull())
              ..orderBy([(t) => OrderingTerm.asc(t.dirtySince)]))
            .get();
    for (final row in rows) {
      if (!_dueForRetry(row.lastAttemptAt, row.attemptCount)) continue;
      await _flushDebt(row);
    }
  }

  Future<void> _flushDebt(CachedDebt row) async {
    await (_db.update(_db.cachedDebts)..where((t) => t.id.equals(row.id)))
        .write(CachedDebtsCompanion(lastAttemptAt: Value(DateTime.now())));
    try {
      if (row.pendingOp == kPendingOpCreate) {
        await _api.post(
          '/debts',
          data: {
            'id': row.id,
            'contactId': row.contactId,
            'type': row.type,
            'amount': row.amount,
            if (row.description != null) 'description': row.description,
            if (row.dueDate != null)
              'dueDate': row.dueDate!.toIso8601String(),
          },
        );
      } else {
        await _api.patch(
          '/debts/${row.id}',
          data: {
            'amount': row.amount,
            if (row.description != null) 'description': row.description,
            if (row.dueDate != null)
              'dueDate': row.dueDate!.toIso8601String(),
          },
        );
      }
      await (_db.update(_db.cachedDebts)..where((t) => t.id.equals(row.id)))
          .write(
            const CachedDebtsCompanion(
              pendingOp: Value(null),
              dirtySince: Value(null),
              syncError: Value(null),
              attemptCount: Value(0),
            ),
          );
    } on DioException catch (e) {
      _log.warn('debt sync failed', {'error': e.message});
      await (_db.update(_db.cachedDebts)..where((t) => t.id.equals(row.id)))
          .write(
            CachedDebtsCompanion(
              syncError: Value(e.message ?? 'Sync failed'),
              attemptCount: Value(row.attemptCount + 1),
            ),
          );
    }
  }
}
