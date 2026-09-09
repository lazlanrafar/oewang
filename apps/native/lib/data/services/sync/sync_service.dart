import 'dart:async';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart';
import 'package:oewang/core/logging/app_logger.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/db/app_database.dart';

final _log = createLogger('sync');

/// Foreground queue processor. Acknowledgements are conditional on the local
/// revision, so an edit made during a request can never be marked as synced.
class SyncService {
  SyncService({
    required AppDatabase db,
    required ApiClient api,
    required String Function() workspaceId,
    DateTime Function()? now,
  }) : _db = db,
       _api = api,
       _workspaceId = workspaceId,
       _now = now ?? DateTime.now;

  final AppDatabase _db;
  final ApiClient _api;
  final String Function() _workspaceId;
  final DateTime Function() _now;
  bool _running = false;
  bool _again = false;

  bool _due(DateTime? last, int attempts) =>
      last == null ||
      _now().difference(last) >=
          Duration(
            seconds: min(5 * pow(2, min(6, max(0, attempts - 1))).toInt(), 300),
          );

  Future<void> flush() async {
    if (_running) {
      _again = true;
      return;
    }
    _running = true;
    try {
      do {
        _again = false;
        final ws = _workspaceId();
        if (ws.isEmpty) return;
        // A transaction can refer to a wallet created in the same offline session.
        await _wallets(ws);
        if (ws != _workspaceId()) return;
        await _transactions(ws);
        if (ws != _workspaceId()) return;
        await _debts(ws);
      } while (_again);
    } on Exception catch (e) {
      // A malformed response must not escape a fire-and-forget flush.
      _log.warn('Sync interrupted', {'type': e.runtimeType.toString()});
    } finally {
      _running = false;
    }
  }

  Future<void> _transactions(String ws) async {
    final rows =
        await (_db.select(_db.cachedTransactions)
              ..where((t) => t.workspaceId.equals(ws) & t.pendingOp.isNotNull())
              ..orderBy([(t) => OrderingTerm.asc(t.dirtySince)]))
            .get();
    final blockedWallets =
        await (_db.select(
              _db.cachedWallets,
            )..where((t) => t.workspaceId.equals(ws) & t.pendingOp.isNotNull()))
            .map((r) => r.id)
            .get();
    final jobs = rows
        .where(
          (r) =>
              _due(r.lastAttemptAt, r.attemptCount) &&
              !blockedWallets.contains(r.walletId) &&
              !blockedWallets.contains(r.toWalletId),
        )
        .map(
          (r) => _Job(
            'cached_transactions',
            'transactions',
            r.id,
            ws,
            r.revision,
            r.pendingOp!,
            {
              'id': r.id, 'walletId': r.walletId,
              if (r.toWalletId != null || r.pendingOp == kPendingOpUpdate)
                'toWalletId': r.toWalletId,
              if (r.categoryId != null || r.pendingOp == kPendingOpUpdate)
                'categoryId': r.categoryId,
              // bulkCreate's TypeBox contract requires a string, not a JSON number.
              'amount': r.amount.toString(),
              'date':
                  '${r.date.year.toString().padLeft(4, '0')}-'
                  '${r.date.month.toString().padLeft(2, '0')}-'
                  '${r.date.day.toString().padLeft(2, '0')}',
              'type': r.type, 'name': r.name, 'description': r.description,
            },
          ),
        )
        .toList();
    final creates = jobs.where((j) => j.create).toList();
    for (var i = 0; i < creates.length; i += 50) {
      if (ws != _workspaceId()) return;
      final batch = creates.sublist(i, min(i + 50, creates.length));
      for (final job in batch) {
        await _started(job);
      }
      if (ws != _workspaceId()) return;
      try {
        final res = await _api.post(
          '/transactions/bulk',
          data: batch.map((j) => j.body).toList(),
          workspaceId: ws,
        );
        final data = _data(res);
        final confirmed = data['transactions'];
        final failures = data['failures'];
        for (var index = 0; index < batch.length; index++) {
          final job = batch[index];
          final matches = confirmed is List
              ? confirmed.whereType<Map<String, dynamic>>().where(
                  (r) => r['id'] == job.id,
                )
              : <Map<String, dynamic>>[];
          if (matches.isNotEmpty) {
            await _ack(job, matches.first);
          } else {
            final errors = failures is List
                ? failures.whereType<Map<String, dynamic>>().where(
                    (f) => f['index'] == index,
                  )
                : <Map<String, dynamic>>[];
            await _failed(
              job,
              errors.isEmpty
                  ? 'Sync failed'
                  : errors.first['reason'].toString(),
            );
          }
        }
      } on Exception catch (e) {
        for (final job in batch) {
          await _failed(job, _error(e));
        }
      }
    }
    for (final job in jobs.where((j) => !j.create)) {
      if (ws != _workspaceId()) return;
      await _send(job);
    }
  }

  Future<void> _wallets(String ws) async {
    final rows =
        await (_db.select(_db.cachedWallets)
              ..where((t) => t.workspaceId.equals(ws) & t.pendingOp.isNotNull())
              ..orderBy([(t) => OrderingTerm.asc(t.dirtySince)]))
            .get();
    for (final r in rows) {
      if (ws != _workspaceId()) return;
      if (!_due(r.lastAttemptAt, r.attemptCount)) continue;
      await _send(
        _Job('cached_wallets', 'wallets', r.id, ws, r.revision, r.pendingOp!, {
          'id': r.id,
          'name': r.name,
          'groupId': r.groupId,
          'balance': r.balance.toString(),
          'isIncludedInTotals': r.isIncludedInTotals,
        }),
      );
    }
  }

  Future<void> _debts(String ws) async {
    final rows =
        await (_db.select(_db.cachedDebts)
              ..where((t) => t.workspaceId.equals(ws) & t.pendingOp.isNotNull())
              ..orderBy([(t) => OrderingTerm.asc(t.dirtySince)]))
            .get();
    for (final r in rows) {
      if (ws != _workspaceId()) return;
      if (!_due(r.lastAttemptAt, r.attemptCount)) continue;
      await _send(
        _Job('cached_debts', 'debts', r.id, ws, r.revision, r.pendingOp!, {
          'id': r.id,
          if (r.pendingOp == kPendingOpCreate) 'contactId': r.contactId,
          if (r.pendingOp == kPendingOpCreate) 'type': r.type,
          'amount': r.amount,
          if (r.description != null) 'description': r.description,
          if (r.dueDate != null) 'dueDate': r.dueDate!.toIso8601String(),
        }),
      );
    }
  }

  Future<void> _send(_Job job) async {
    await _started(job);
    if (job.ws != _workspaceId()) return;
    try {
      final body = Map<String, dynamic>.of(job.body)..remove('id');
      final res = job.create
          ? await _api.post(
              '/${job.route}',
              data: job.body,
              workspaceId: job.ws,
            )
          : job.route == 'debts'
          ? await _api.patch(
              '/${job.route}/${job.id}',
              data: body,
              workspaceId: job.ws,
            )
          : await _api.put(
              '/${job.route}/${job.id}',
              data: body,
              workspaceId: job.ws,
            );
      final data = _data(res);
      if (data['id'] != job.id) {
        throw const FormatException('Missing acknowledgement');
      }
      await _ack(job, data);
    } on Exception catch (e) {
      await _failed(job, _error(e));
    }
  }

  Map<String, dynamic> _data(Response<dynamic> res) {
    final body = res.data;
    if (body is! Map<String, dynamic> ||
        body['success'] == false ||
        body['data'] is! Map<String, dynamic>) {
      throw const FormatException('Invalid sync response');
    }
    return body['data'] as Map<String, dynamic>;
  }

  String _error(Exception e) {
    if (e is DioException) {
      final body = e.response?.data;
      if (body is Map<String, dynamic> && body['message'] is String) {
        return body['message'] as String;
      }
      return 'Network error';
    }
    return 'Invalid sync response';
  }

  TableInfo<Table, Object?> _table(_Job j) => switch (j.table) {
    'cached_transactions' => _db.cachedTransactions,
    'cached_wallets' => _db.cachedWallets,
    _ => _db.cachedDebts,
  };

  Future<void> _started(_Job j) => _db.customUpdate(
    'UPDATE ${j.table} SET last_attempt_at = ? WHERE id = ? AND workspace_id = ? AND revision = ?',
    variables: [
      Variable(_now()),
      Variable(j.id),
      Variable(j.ws),
      Variable(j.revision),
    ],
    updates: {_table(j)},
  );

  Future<void> _failed(_Job j, String message) => _db.customUpdate(
    'UPDATE ${j.table} SET sync_error = ?, attempt_count = attempt_count + 1 '
    'WHERE id = ? AND workspace_id = ? AND revision = ?',
    variables: [
      Variable(message),
      Variable(j.id),
      Variable(j.ws),
      Variable(j.revision),
    ],
    updates: {_table(j)},
  );

  Future<void> _ack(_Job j, Map<String, dynamic> server) async {
    // A replay may return the OLD create payload after the user edited locally
    // during a failed request. Follow it with an update; never drop that edit.
    final differs =
        j.create &&
        j.body.entries.any((e) {
          if (!server.containsKey(e.key)) return false;
          final actual = server[e.key];
          if (e.key == 'amount' || e.key == 'balance') {
            return num.tryParse('${e.value}') != num.tryParse('$actual');
          }
          if (e.key == 'date' || e.key == 'dueDate') {
            return '$actual'.split('T').first != '${e.value}'.split('T').first;
          }
          return actual != e.value;
        });
    // Refresh server-derived debt fields only for the acknowledged revision.
    // A newer local edit retains its own optimistic remaining amount/status.
    if (j.route == 'debts' && !differs) {
      final remaining = num.tryParse('${server['remainingAmount']}');
      final status = server['status'];
      await (_db.update(_db.cachedDebts)..where(
            (t) =>
                t.id.equals(j.id) &
                t.workspaceId.equals(j.ws) &
                t.revision.equals(j.revision),
          ))
          .write(
            CachedDebtsCompanion(
              remainingAmount: remaining == null
                  ? const Value.absent()
                  : Value(remaining.toDouble()),
              status: status is String ? Value(status) : const Value.absent(),
            ),
          );
    }
    await _db.customUpdate(
      'UPDATE ${j.table} SET pending_op = CASE WHEN revision = ? AND ? = 0 THEN NULL ELSE ? END, '
      'dirty_since = CASE WHEN revision = ? AND ? = 0 THEN NULL ELSE dirty_since END, '
      'sync_error = NULL, attempt_count = 0, last_attempt_at = NULL '
      'WHERE id = ? AND workspace_id = ?',
      variables: [
        Variable(j.revision),
        Variable(differs ? 1 : 0),
        const Variable(kPendingOpUpdate),
        Variable(j.revision),
        Variable(differs ? 1 : 0),
        Variable(j.id),
        Variable(j.ws),
      ],
      updates: {_table(j)},
    );
  }
}

class _Job {
  const _Job(
    this.table,
    this.route,
    this.id,
    this.ws,
    this.revision,
    this.op,
    this.body,
  );
  final String table;
  final String route;
  final String id;
  final String ws;
  final int revision;
  final String op;
  final Map<String, dynamic> body;
  bool get create => op == kPendingOpCreate;
}
