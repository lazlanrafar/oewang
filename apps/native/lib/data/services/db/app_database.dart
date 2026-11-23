import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

/// The device's offline store (MOB-6): cached API rows and the write queue.
///
/// Plain SQL on drift rather than generated tables: two tables of JSON need
/// no codegen step, and a cached row stays byte-for-byte what the API sent,
/// so `updated_at` goes back as `If-Match` exactly as emitted (D115).
/// Every query is scoped to a workspace, so switching workspace never shows
/// or replays another one's rows.
class AppDatabase extends GeneratedDatabase {
  AppDatabase(super.executor);

  factory AppDatabase.open() =>
      AppDatabase(driftDatabase(name: 'oewang_offline'));

  @override
  int get schemaVersion => 1;

  @override
  Iterable<TableInfo<Table, dynamic>> get allTables => const [];

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (_) async {
      // `day` is the local calendar day of a transaction, for month reads.
      await customStatement('''
        CREATE TABLE cached_rows (
          workspace_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          id TEXT NOT NULL,
          day TEXT,
          ord INTEGER NOT NULL DEFAULT 0,
          json TEXT NOT NULL,
          PRIMARY KEY (workspace_id, kind, id)
        )''');
      await customStatement('''
        CREATE TABLE write_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          op TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          payload TEXT,
          before_json TEXT,
          base_updated_at TEXT,
          status TEXT NOT NULL,
          error TEXT,
          current_json TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )''');
    },
  );

  // ------------------------------------------------------------ cached rows

  /// Rows of [kind], newest day first for transactions, otherwise in the
  /// order the API listed them. [from] and [to] are inclusive local days.
  Future<List<Map<String, dynamic>>> rows(
    String ws,
    String kind, {
    String? from,
    String? to,
  }) async {
    final result = await customSelect(
      'SELECT json FROM cached_rows WHERE workspace_id = ? AND kind = ?'
      '${from != null ? ' AND day >= ? AND day <= ?' : ''}'
      ' ORDER BY day DESC, ord, id',
      variables: [
        Variable(ws),
        Variable(kind),
        if (from != null) ...[Variable(from), Variable(to)],
      ],
    ).get();
    return [for (final r in result) _decode(r.read<String>('json'))!];
  }

  Future<Map<String, dynamic>?> row(String ws, String kind, String id) async {
    final r = await customSelect(
      'SELECT json FROM cached_rows WHERE workspace_id = ? AND kind = ? AND id = ?',
      variables: [Variable(ws), Variable(kind), Variable(id)],
    ).getSingleOrNull();
    return r == null ? null : _decode(r.read<String>('json'));
  }

  Future<void> putRow(
    String ws,
    String kind,
    Map<String, dynamic> json, {
    int? ord,
  }) => customStatement(
    'INSERT INTO cached_rows (workspace_id, kind, id, day, ord, json) '
    'VALUES (?, ?, ?, ?, COALESCE(?, (SELECT ord FROM cached_rows '
    'WHERE workspace_id = ? AND kind = ? AND id = ?), 1000000), ?) '
    'ON CONFLICT (workspace_id, kind, id) DO UPDATE SET '
    'day = excluded.day, ord = excluded.ord, json = excluded.json',
    [
      ws,
      kind,
      json['id'],
      dayOf(json),
      ord,
      ws,
      kind,
      json['id'],
      jsonEncode(json),
    ],
  );

  Future<void> removeRow(String ws, String kind, String id) => customStatement(
    'DELETE FROM cached_rows WHERE workspace_id = ? AND kind = ? AND id = ?',
    [ws, kind, id],
  );

  /// Replaces the cached rows of [kind] (within the inclusive days [from] to
  /// [to] for transactions) with what the API answered, in its order. A row
  /// with a queue entry keeps its local state: the API does not have it yet.
  Future<void> replaceRows(
    String ws,
    String kind,
    List<Map<String, dynamic>> fresh, {
    String? from,
    String? to,
  }) => transaction(() async {
    final local = await _queuedIds(ws, kind);
    await customStatement(
      'DELETE FROM cached_rows WHERE workspace_id = ? AND kind = ?'
      '${from != null ? ' AND day >= ? AND day <= ?' : ''}'
      ' AND id NOT IN (SELECT entity_id FROM write_queue WHERE workspace_id = ?)',
      [
        ws,
        kind,
        if (from != null) ...[from, to],
        ws,
      ],
    );
    for (var i = 0; i < fresh.length; i++) {
      if (local.contains(fresh[i]['id'])) continue;
      await putRow(ws, kind, fresh[i], ord: i);
    }
  });

  Future<Set<String>> _queuedIds(String ws, String kind) async {
    final result = await customSelect(
      'SELECT entity_id FROM write_queue WHERE workspace_id = ? AND kind = ?',
      variables: [Variable(ws), Variable(kind)],
    ).get();
    return {for (final r in result) r.read<String>('entity_id')};
  }

  /// The local day a transaction row falls on, or null for other kinds.
  static String? dayOf(Map<String, dynamic> json) {
    final date = json['date'];
    if (date is! String) return null;
    final d = DateTime.parse(date).toLocal();
    return '${d.year.toString().padLeft(4, '0')}-'
        '${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
  }

  // ------------------------------------------------------------ write queue

  Future<int> enqueue(QueueEntry e) => customInsert(
    'INSERT INTO write_queue (workspace_id, kind, op, entity_id, payload, '
    'before_json, base_updated_at, status, attempts, created_at) '
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
    variables: [
      Variable(e.workspaceId),
      Variable(e.kind),
      Variable(e.op.name),
      Variable(e.entityId),
      Variable(_encode(e.payload)),
      Variable(_encode(e.before)),
      Variable(e.baseUpdatedAt),
      Variable(QueueStatus.queued.name),
      Variable(DateTime.now().toUtc().toIso8601String()),
    ],
  );

  /// Every entry of the workspace, oldest first: the replay order.
  Future<List<QueueEntry>> entries(String ws) async {
    final result = await customSelect(
      'SELECT * FROM write_queue WHERE workspace_id = ? ORDER BY id',
      variables: [Variable(ws)],
    ).get();
    return [for (final r in result) QueueEntry._fromRow(r)];
  }

  Future<void> setEntry(
    int id, {
    required QueueStatus status,
    String? error,
    String? currentJson,
    int attemptsDelta = 0,
  }) => customStatement(
    'UPDATE write_queue SET status = ?, error = ?, current_json = ?, '
    'attempts = attempts + ? WHERE id = ?',
    [status.name, error, currentJson, attemptsDelta, id],
  );

  /// "Apply anyway" (MOB-7): back in the queue, sent without `If-Match`.
  Future<void> requeueWithoutBase(int id) => customStatement(
    "UPDATE write_queue SET status = 'queued', error = NULL, "
    'current_json = NULL, base_updated_at = NULL WHERE id = ?',
    [id],
  );

  /// After an entry for [entityId] lands, the edits queued behind it were
  /// made on top of it: their base becomes the version the API answered.
  Future<void> rebase(int afterId, String entityId, String updatedAt) =>
      customStatement(
        "UPDATE write_queue SET base_updated_at = ? WHERE op = 'update' "
        'AND entity_id = ? AND id > ?',
        [updatedAt, entityId, afterId],
      );

  Future<void> deleteEntry(int id) =>
      customStatement('DELETE FROM write_queue WHERE id = ?', [id]);

  static String? _encode(Object? json) =>
      json == null ? null : jsonEncode(json);
  static Map<String, dynamic>? _decode(String? s) =>
      s == null ? null : jsonDecode(s) as Map<String, dynamic>?;
}

enum QueueOp { create, update, delete }

/// `sending` is set while the request is in flight; an app killed mid-flight
/// replays it, which D114 (create) and If-Match (update) make safe.
enum QueueStatus { queued, sending, failed, conflict }

/// One queued write. [kind] is the resource and the path segment:
/// `transactions`, `wallets` or `categories`.
class QueueEntry {
  const QueueEntry({
    required this.workspaceId,
    required this.kind,
    required this.op,
    required this.entityId,
    this.id = 0,
    this.payload,
    this.before,
    this.baseUpdatedAt,
    this.status = QueueStatus.queued,
    this.error,
    this.currentJson,
    this.attempts = 0,
  });

  factory QueueEntry._fromRow(QueryRow r) => QueueEntry(
    id: r.read<int>('id'),
    workspaceId: r.read<String>('workspace_id'),
    kind: r.read<String>('kind'),
    op: QueueOp.values.byName(r.read<String>('op')),
    entityId: r.read<String>('entity_id'),
    payload: AppDatabase._decode(r.readNullable<String>('payload')),
    before: AppDatabase._decode(r.readNullable<String>('before_json')),
    baseUpdatedAt: r.readNullable<String>('base_updated_at'),
    status: QueueStatus.values.byName(r.read<String>('status')),
    error: r.readNullable<String>('error'),
    currentJson: r.readNullable<String>('current_json'),
    attempts: r.read<int>('attempts'),
  );

  final int id;
  final String workspaceId;
  final String kind;
  final QueueOp op;
  final String entityId;

  /// The request body as sent, the client `id` included on a create.
  final Map<String, dynamic>? payload;

  /// The cached row when the write was queued: what a dismissed entry puts
  /// back, and the old side of a balance delta.
  final Map<String, dynamic>? before;

  /// The row's `updated_at` this edit was based on, verbatim (D115).
  final String? baseUpdatedAt;
  final QueueStatus status;
  final String? error;

  /// On a conflict, `details.current` as JSON text; `'null'` when the row
  /// was deleted elsewhere.
  final String? currentJson;
  final int attempts;

  Map<String, dynamic>? get current => AppDatabase._decode(currentJson);

  /// Still owed to the API (failed entries are not retried).
  bool get isPending => status != QueueStatus.failed;
}
