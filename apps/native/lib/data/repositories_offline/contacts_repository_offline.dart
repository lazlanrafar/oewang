import 'package:cuid2/cuid2.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/debt_dto.dart';
import 'package:oewang/data/repositories/contacts_repository.dart';
import 'package:oewang/data/repositories_offline/debts_repository_offline.dart';
import 'package:oewang/data/repositories_remote/debts_repository_remote.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/data/services/sync/sync_service.dart';
import 'package:oewang/domain/models/contact.dart';

const _kind = 'contacts';

/// Contacts from the cache when offline, written through the queue (MOB-10).
class ContactsRepositoryOffline implements ContactsRepository {
  ContactsRepositoryOffline({
    required ContactsRepository remote,
    required ApiClient api,
    required SyncService sync,
  }) : _remote = remote,
       _api = api,
       _sync = sync;

  final ContactsRepository _remote;
  final ApiClient _api;
  final SyncService _sync;

  AppDatabase get _db => _sync.db;

  @override
  Future<Result<List<Contact>, AppError>> list({String? search}) async {
    final ws = _sync.workspaceId;
    if (ws == null) return _remote.list(search: search);
    if (!(await _db.entries(ws)).any(isDebtWrite)) {
      final error = await _sync.pull(
        _kind,
        () => fetchAllPages(_api, '/contacts'),
      );
      if (error != null) return Failure(error);
    }
    final q = search?.trim().toLowerCase() ?? '';
    return Success([
      for (final r in await _db.rows(ws, _kind))
        if (q.isEmpty ||
            [
              r['name'],
              r['email'],
              r['phone'],
            ].any((f) => f is String && f.toLowerCase().contains(q)))
          contactFromJson(r),
    ]);
  }

  @override
  Future<Result<Contact, AppError>> create({
    required String name,
    String? email,
    String? phone,
    String? note,
  }) {
    final id = cuid();
    final body = {
      'id': id,
      ...contactBody(name: name, email: email, phone: phone, note: note),
    };
    return _write(QueueOp.create, id, body, body);
  }

  @override
  Future<Result<Contact, AppError>> update({
    required String id,
    required String name,
    String? email,
    String? phone,
    String? note,
  }) async {
    final ws = _sync.workspaceId;
    final before = ws == null ? null : await _db.row(ws, _kind, id);
    final body = contactBody(
      name: name,
      email: email,
      phone: phone,
      note: note,
    );
    return _write(QueueOp.update, id, body, {...?before, ...body, 'id': id});
  }

  @override
  Future<Result<void, AppError>> delete(String id) =>
      _sync.write(kind: _kind, op: QueueOp.delete, entityId: id).mapRow((_) {});

  /// Sent or queued, the cached debts move to [intoId] at once, as the API
  /// moves them (CON-4).
  @override
  Future<Result<void, AppError>> merge({
    required String id,
    required String intoId,
  }) async {
    final ws = _sync.workspaceId;
    if (ws == null) return _remote.merge(id: id, intoId: intoId);
    final res = await _sync.write(
      kind: mergeKind(id),
      op: QueueOp.create,
      entityId: cuid(),
      payload: {'into_id': intoId},
    );
    if (res is Success) {
      final into = await _db.row(ws, _kind, intoId);
      for (final d in await _db.rows(ws, 'debts')) {
        if (d['contact_id'] != id) continue;
        await _db.putRow(ws, 'debts', {
          ...d,
          'contact_id': intoId,
          'contact_name': into?['name'] ?? d['contact_name'],
        });
      }
      await _db.removeRow(ws, _kind, id);
    }
    return res.discard();
  }

  Future<Result<Contact, AppError>> _write(
    QueueOp op,
    String id,
    Json body,
    Json optimistic,
  ) => _sync
      .write(
        kind: _kind,
        op: op,
        entityId: id,
        payload: body,
        optimistic: optimistic,
      )
      .mapRow((row) => contactFromJson(row!));
}
