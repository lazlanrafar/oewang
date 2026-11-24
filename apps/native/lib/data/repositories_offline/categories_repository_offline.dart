import 'package:cuid2/cuid2.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/category_dto.dart';
import 'package:oewang/data/repositories/categories_repository.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/data/services/sync/sync_service.dart';
import 'package:oewang/domain/models/category.dart';

const _kind = 'categories';

String _wire(CategoryType t) => t == CategoryType.income ? 'income' : 'expense';

/// Categories from the cache when offline, written through the queue (MOB-6).
class CategoriesRepositoryOffline implements CategoriesRepository {
  CategoriesRepositoryOffline({
    required CategoriesRepository remote,
    required ApiClient api,
    required SyncService sync,
  }) : _remote = remote,
       _api = api,
       _sync = sync;

  final CategoriesRepository _remote;
  final ApiClient _api;
  final SyncService _sync;

  AppDatabase get _db => _sync.db;

  @override
  Future<Result<List<Category>, AppError>> list({CategoryType? type}) async {
    final ws = _sync.workspaceId;
    if (ws == null) return _remote.list(type: type);
    // Both types at once, so the cache holds them all.
    final error = await _sync.pull(_kind, () async {
      final data = envelopeData(await _api.get('/categories'));
      return [for (final r in (data as List?) ?? const []) r as Json];
    });
    if (error != null) return Failure(error);
    return Success([
      for (final r in await _db.rows(ws, _kind))
        if (type == null || r['type'] == _wire(type))
          CategoryDto.fromJson(r).toDomain(),
    ]);
  }

  @override
  Future<Result<Category, AppError>> create({
    required String name,
    required CategoryType type,
  }) {
    final id = cuid();
    final body = {'id': id, 'name': name, 'type': _wire(type)};
    return _write(QueueOp.create, id, body, {'sort_order': 0, ...body});
  }

  @override
  Future<Result<Category, AppError>> update({
    required String id,
    required String name,
  }) async {
    final ws = _sync.workspaceId;
    final before = ws == null ? null : await _db.row(ws, _kind, id);
    final body = {'name': name};
    return _write(QueueOp.update, id, body, {
      'type': 'expense',
      ...?before,
      ...body,
      'id': id,
    });
  }

  Future<Result<Category, AppError>> _write(
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
      .mapRow((row) => CategoryDto.fromJson(row!).toDomain());

  // shortcut: a category deleted offline leaves its transactions' cached
  // category name until they are fetched again (the API clears it, CAT-2).
  @override
  Future<Result<void, AppError>> delete(String id) =>
      _sync.write(kind: _kind, op: QueueOp.delete, entityId: id).mapRow((_) {});

  /// Needs a connection.
  @override
  Future<Result<void, AppError>> reorder(List<String> orderedIds) =>
      _remote.reorder(orderedIds);
}
