import 'package:drift/drift.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/categories_repository.dart';
import 'package:oewang/data/repositories_remote/categories_repository_remote.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/domain/models/category.dart';

/// Read-only cache decorator — categories aren't offline-writable in v1,
/// this just keeps the transaction form's category picker populated offline.
/// Every other method delegates straight to [remote] (requires connectivity).
class CategoriesRepositoryOffline implements CategoriesRepository {
  CategoriesRepositoryOffline({
    required CategoriesRepositoryRemote remote,
    required AppDatabase db,
    required String Function() workspaceId,
  }) : _remote = remote,
       _db = db,
       _workspaceId = workspaceId;

  final CategoriesRepositoryRemote _remote;
  final AppDatabase _db;
  final String Function() _workspaceId;

  @override
  Future<Result<List<Category>, AppError>> list({CategoryType? type}) async {
    final ws = _workspaceId();
    final result = await _remote.list(type: type);
    if (result case Success<List<Category>, AppError>(value: final cats)) {
      await _cache(ws, cats);
      return result;
    }
    if (result case Failure<List<Category>, AppError>(error: NetworkError())) {
      return Success(await _readCached(ws, type));
    }
    return result;
  }

  @override
  Future<Result<Category, AppError>> create({
    required String name,
    required CategoryType type,
  }) => _remote.create(name: name, type: type);

  @override
  Future<Result<Category, AppError>> update({
    required String id,
    required String name,
  }) => _remote.update(id: id, name: name);

  @override
  Future<Result<void, AppError>> delete(String id) => _remote.delete(id);

  @override
  Future<Result<void, AppError>> reorder(List<String> orderedIds) =>
      _remote.reorder(orderedIds);

  Future<void> _cache(String ws, List<Category> cats) async {
    if (cats.isEmpty) return;
    await _db.batch((b) {
      for (final c in cats) {
        b.insert(
          _db.cachedCategories,
          CachedCategoriesCompanion.insert(
            id: c.id,
            workspaceId: ws,
            name: c.name,
            type: c.type == CategoryType.income ? 'income' : 'expense',
            emoji: Value(c.emoji),
          ),
          mode: InsertMode.insertOrReplace,
        );
      }
    });
  }

  Future<List<Category>> _readCached(String ws, CategoryType? type) async {
    final rows =
        await (_db.select(_db.cachedCategories)..where(
              (t) =>
                  t.workspaceId.equals(ws) &
                  (type == null
                      ? const Constant(true)
                      : t.type.equals(
                          type == CategoryType.income ? 'income' : 'expense',
                        )),
            ))
            .get();
    return rows
        .map(
          (r) => Category(
            id: r.id,
            name: r.name,
            type: r.type == 'income' ? CategoryType.income : CategoryType.expense,
            emoji: r.emoji,
          ),
        )
        .toList();
  }
}
