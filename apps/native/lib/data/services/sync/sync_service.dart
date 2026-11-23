import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:decimal/decimal.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:oewang/core/logging/app_logger.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/db/app_database.dart';

typedef Json = Map<String, dynamic>;

final _log = createLogger('sync');

/// What the sync banner shows.
@immutable
class SyncStatus {
  const SyncStatus({
    this.online = true,
    this.pending = 0,
    this.failed = 0,
    this.conflicts = 0,
  });

  final bool online;

  /// Entries still to send.
  final int pending;
  final int failed;
  final int conflicts;

  bool get isIdle => online && pending == 0 && failed == 0 && conflicts == 0;
}

/// Offline writes for transactions, wallets and categories (MOB-6, MOB-7,
/// D114, D115; docs/features/mobile.md#offline-d114-d115).
///
/// A write goes straight to the API when the device is online and nothing
/// is queued; otherwise, or when that request cannot reach the API, it is
/// queued and applied to the cache at once. The queue replays strictly in
/// order, one request at a time.
class SyncService {
  SyncService({
    required this.db,
    required ApiClient api,
    required String? Function() workspaceId,
    required bool Function() canWrite,
    this.onSynced,
  }) : _api = api,
       _workspaceId = workspaceId,
       _canWrite = canWrite;

  final AppDatabase db;
  final ApiClient _api;
  final String? Function() _workspaceId;
  final bool Function() _canWrite;

  /// Called when the cache changed outside a repository call (an entry
  /// landed, a conflict was resolved), so screens reload.
  void Function()? onSynced;

  final status = ValueNotifier<SyncStatus>(const SyncStatus());

  bool _online = true;
  bool get online => _online;

  Future<void>? _running;
  bool _again = false;
  Timer? _retry;

  String? get workspaceId => _workspaceId();

  void setOnline({required bool online}) {
    _online = online;
    unawaited(online ? drain() : _refresh());
  }

  void dispose() {
    _retry?.cancel();
    status.dispose();
  }

  // ------------------------------------------------------------------ write

  /// Sends or queues one write. Answers the API's row when it was sent, the
  /// optimistic row ([optimistic], null for a delete) when it was queued,
  /// or the API's refusal.
  Future<Result<Json?, AppError>> write({
    required String kind,
    required QueueOp op,
    required String entityId,
    Json? payload,
    Json? optimistic,
  }) async {
    final ws = workspaceId;
    if (ws == null) return const Failure(UnknownError('No workspace'));
    final before = op == QueueOp.create
        ? null
        : await db.row(ws, kind, entityId);
    final entry = QueueEntry(
      workspaceId: ws,
      kind: kind,
      op: op,
      entityId: entityId,
      payload: payload,
      before: before,
      baseUpdatedAt: op == QueueOp.update
          ? (before?['updated_at'] as String?)
          : null,
    );

    // A viewer never queues (MOB-5): the API refuses the write, or the
    // network error is shown.
    final canQueue = _canWrite();
    final busy = (await db.entries(ws)).any((e) => e.isPending);
    if (!canQueue || (_online && !busy)) {
      final outcome = await _send(entry, ifMatch: false);
      switch (outcome) {
        case _Done(:final row):
          await _landed(entry, row);
          return Success(row);
        case _Retry() when canQueue:
          break; // queue it below; the client id makes the repeat safe
        case _Retry(:final error) ||
            _Failed(:final error) ||
            _Conflict(:final error):
          return Failure(error);
      }
    }

    await db.enqueue(entry);
    if (optimistic == null) {
      await db.removeRow(ws, kind, entityId);
    } else {
      await db.putRow(ws, kind, optimistic);
    }
    await _refresh();
    unawaited(drain());
    return Success(optimistic);
  }

  // ----------------------------------------------------------------- replay

  /// Replays the queue in order. Safe to call at any time: a call during a
  /// replay runs one more pass and completes with it.
  Future<void> drain() {
    if (_running case final running?) {
      _again = true;
      return running;
    }
    return _running = _drainPasses().whenComplete(() => _running = null);
  }

  Future<void> _drainPasses() async {
    _retry?.cancel();
    do {
      _again = false;
      await _drainOnce();
    } while (_again);
    await _refresh();
  }

  Future<void> _drainOnce() async {
    final ws = workspaceId;
    if (ws == null || !_online) return;
    var landed = false;
    while (true) {
      // Read afresh each step: a landed entry rebases the ones behind it.
      final entries = await db.entries(ws);
      final conflicted = <String>{};
      QueueEntry? next;
      for (final e in entries) {
        if (e.status == QueueStatus.conflict) conflicted.add(e.entityId);
        if ((e.status == QueueStatus.queued ||
                e.status == QueueStatus.sending) &&
            !conflicted.contains(e.entityId)) {
          next = e;
          break;
        }
      }
      if (next == null) {
        final waiting = entries.any(
          (e) =>
              e.status == QueueStatus.queued || e.status == QueueStatus.sending,
        );
        if (landed && !waiting) onSynced?.call();
        return;
      }

      await db.setEntry(next.id, status: QueueStatus.sending);
      final outcome = await _send(next, ifMatch: true);
      switch (outcome) {
        case _Done(:final row):
          await db.deleteEntry(next.id);
          await _landed(next, row);
          landed = true;
        case _Conflict(:final error, :final currentJson):
          await db.setEntry(
            next.id,
            status: QueueStatus.conflict,
            error: error.message,
            currentJson: currentJson,
            attemptsDelta: 1,
          );
        case _Failed(:final error):
          await db.setEntry(
            next.id,
            status: QueueStatus.failed,
            error: error.message,
            attemptsDelta: 1,
          );
        case _Retry():
          // Strict order: nothing behind it goes first.
          await db.setEntry(
            next.id,
            status: QueueStatus.queued,
            attemptsDelta: 1,
          );
          _retry = Timer(backoff(next.attempts + 1), () => unawaited(drain()));
          if (landed) onSynced?.call();
          return;
      }
      await _refresh();
    }
  }

  /// 2 s, 4 s, 8 s … capped at five minutes.
  @visibleForTesting
  static Duration backoff(int attempts) =>
      Duration(seconds: min(300, 1 << min(attempts, 9)));

  Future<_Outcome> _send(QueueEntry e, {required bool ifMatch}) async {
    final path = e.op == QueueOp.create
        ? '/${e.kind}'
        : '/${e.kind}/${e.entityId}';
    final base = e.baseUpdatedAt;
    try {
      final res = await switch (e.op) {
        QueueOp.create => _api.post(path, data: e.payload),
        QueueOp.update => _api.patch(
          path,
          data: e.payload,
          headers: ifMatch && base != null ? {'If-Match': base} : null,
        ),
        QueueOp.delete => _api.delete(path),
      };
      return _Done(envelopeData(res) as Json?);
    } on DioException catch (ex) {
      final error = mapDioError(ex);
      final status = ex.response?.statusCode;
      if (_transient(error, status)) return _Retry(error);
      // Already gone is what a delete wanted.
      if (e.op == QueueOp.delete && status == 404) return const _Done(null);
      if (error.code == 'STALE') {
        final body = ex.response?.data;
        final details = body is Map ? body['error'] : null;
        final current = details is Map ? details['details'] : null;
        return _Conflict(
          error,
          jsonEncode(current is Map ? current['current'] : null),
        );
      }
      _log.warn('queued write refused', {
        'kind': e.kind,
        'op': e.op.name,
        'code': error.code,
      });
      return _Failed(error);
    }
  }

  /// Worth another try later: the API was not reached, or not able.
  static bool _transient(AppError error, int? status) =>
      error is NetworkError ||
      error.code == 'TRANSPORT_UNEXPECTED_RESPONSE' ||
      status == null ||
      status >= 500 ||
      status == 401 ||
      status == 429;

  /// Refreshes the cached [kind] rows (for transactions, the inclusive days
  /// [from] to [to]) from the API when online. Answers the API's refusal;
  /// an unreachable API is not an error, the cache answers instead.
  Future<AppError?> pull(
    String kind,
    Future<List<Json>> Function() fetch, {
    String? from,
    String? to,
  }) async {
    final ws = workspaceId;
    if (ws == null || !_online) return null;
    try {
      await db.replaceRows(ws, kind, await fetch(), from: from, to: to);
      return null;
    } on DioException catch (e) {
      final error = mapDioError(e);
      return _transient(error, e.response?.statusCode) ? null : error;
    }
  }

  /// The API took [e] and answered [row] (null for a delete).
  Future<void> _landed(QueueEntry e, Json? row) async {
    final ws = e.workspaceId;
    if (e.kind == 'transactions') {
      // The API moved the balances; keep the cached figure in step, so an
      // estimate never counts this write twice or not at all.
      await _addToBalances(ws, transactionDelta(e.before, row));
    }
    if (e.op == QueueOp.delete) {
      await db.removeRow(ws, e.kind, e.entityId);
      return;
    }
    if (row == null) return;
    final later = (await db.entries(
      ws,
    )).any((x) => x.entityId == e.entityId && x.id > e.id && x.isPending);
    final updatedAt = row['updated_at'] as String?;
    if (updatedAt != null) await db.rebase(e.id, e.entityId, updatedAt);
    // Edits still queued behind it are already applied locally.
    if (!later) await db.putRow(ws, e.kind, row);
  }

  Future<void> _addToBalances(String ws, Map<String, Decimal> delta) async {
    for (final MapEntry(key: id, value: d) in delta.entries) {
      final wallet = await db.row(ws, 'wallets', id);
      if (wallet == null) continue;
      final balance = Decimal.parse(wallet['balance'] as String) + d;
      await db.putRow(ws, 'wallets', {...wallet, 'balance': '$balance'});
    }
  }

  // ---------------------------------------------------------- reads, status

  /// Per wallet, what the queued transaction writes add to the cached
  /// balance. A wallet named here shows its balance as an estimate.
  Future<Map<String, Decimal>> pendingBalanceDeltas(String ws) async {
    final out = <String, Decimal>{};
    for (final e in await db.entries(ws)) {
      if (e.kind != 'transactions' || !e.isPending) continue;
      // A transaction body is whole, so it is the row's new side.
      final after = e.op == QueueOp.delete ? null : e.payload;
      for (final MapEntry(key: id, value: d) in transactionDelta(
        e.before,
        after,
      ).entries) {
        out[id] = (out[id] ?? Decimal.zero) + d;
      }
    }
    return out;
  }

  /// The workspace currency as last seen online (the month summary stores
  /// it), for figures shown offline.
  Future<String?> lastCurrency() async {
    final ws = workspaceId;
    final meta = ws == null ? null : await db.row(ws, 'meta', 'currency');
    return meta?['code'] as String?;
  }

  /// Entries that need the person: refused, or in conflict.
  Future<List<QueueEntry>> issues() async {
    final ws = workspaceId;
    if (ws == null) return const [];
    return [
      for (final e in await db.entries(ws))
        if (e.status == QueueStatus.failed || e.status == QueueStatus.conflict)
          e,
    ];
  }

  Future<void> _refresh() async {
    final ws = workspaceId;
    final entries = ws == null ? const <QueueEntry>[] : await db.entries(ws);
    int count(QueueStatus s) => entries.where((e) => e.status == s).length;
    status.value = SyncStatus(
      online: _online,
      pending: count(QueueStatus.queued) + count(QueueStatus.sending),
      failed: count(QueueStatus.failed),
      conflicts: count(QueueStatus.conflict),
    );
  }

  // ------------------------------------------------------------- resolution

  /// "Discard my change": drop the entry. A conflict takes the row as the
  /// API has it now (gone when it was deleted); a refused write puts back
  /// the row as it was before the change.
  Future<void> discard(QueueEntry e) async {
    await db.deleteEntry(e.id);
    final row = e.status == QueueStatus.conflict ? e.current : e.before;
    if (row == null) {
      await db.removeRow(e.workspaceId, e.kind, e.entityId);
    } else {
      await db.putRow(e.workspaceId, e.kind, row);
    }
    onSynced?.call();
    await drain();
  }

  /// "Apply anyway": resend the edit without `If-Match` (D115).
  Future<void> applyAnyway(QueueEntry e) async {
    await db.requeueWithoutBase(e.id);
    await drain();
  }
}

/// How a transaction row (a `TransactionView` or a request body) moves the
/// balance of each wallet it names. Exact decimals only (D12).
Map<String, Decimal> transactionEffect(Json? row) {
  if (row == null) return const {};
  final amount = Decimal.parse(row['amount'] as String);
  final wallet = row['wallet_id'] as String;
  final out = <String, Decimal>{};
  void add(String id, Decimal d) => out[id] = (out[id] ?? Decimal.zero) + d;
  switch (row['type']) {
    case 'income':
      add(wallet, amount);
    case 'expense':
      add(wallet, -amount);
    case 'transfer':
      add(wallet, -amount);
      final to = row['to_wallet_id'] as String?;
      final toAmount = row['to_amount'] as String?;
      // shortcut: a queued transfer has no to_amount yet, so a transfer
      // between two currencies estimates with the source amount until it syncs.
      if (to != null) {
        add(to, toAmount == null ? amount : Decimal.parse(toAmount));
      }
  }
  return out;
}

/// The balance change of replacing [before] with [after] (either may be null).
Map<String, Decimal> transactionDelta(Json? before, Json? after) {
  final out = {...transactionEffect(after)};
  for (final MapEntry(key: id, value: d) in transactionEffect(before).entries) {
    out[id] = (out[id] ?? Decimal.zero) - d;
  }
  return out;
}

extension SyncWriteResult on Future<Result<Json?, AppError>> {
  /// The row a write answered, as the repository's domain type.
  Future<Result<T, AppError>> mapRow<T>(T Function(Json? row) to) async =>
      switch (await this) {
        Success(:final value) => Success(to(value)),
        Failure(:final error) => Failure(error),
      };
}

sealed class _Outcome {
  const _Outcome();
}

class _Done extends _Outcome {
  const _Done(this.row);
  final Json? row;
}

class _Retry extends _Outcome {
  const _Retry(this.error);
  final AppError error;
}

class _Failed extends _Outcome {
  const _Failed(this.error);
  final AppError error;
}

class _Conflict extends _Outcome {
  const _Conflict(this.error, this.currentJson);
  final AppError error;
  final String currentJson;
}
