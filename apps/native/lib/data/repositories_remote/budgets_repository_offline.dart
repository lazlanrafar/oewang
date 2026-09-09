import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/budgets_repository.dart';
import 'package:oewang/data/services/db/app_database.dart';
import 'package:oewang/domain/models/budget_status.dart';
import 'package:oewang/domain/models/money.dart';

/// Budget snapshots are partitioned by workspace AND month. Mutations remain
/// online-only; cached status represents the last successful server read.
class BudgetsRepositoryOffline implements BudgetsRepository {
  BudgetsRepositoryOffline({
    required BudgetsRepository remote,
    required AppDatabase db,
    required String Function() workspaceId,
  }) : _remote = remote,
       _db = db,
       _workspaceId = workspaceId;
  final BudgetsRepository _remote;
  final AppDatabase _db;
  final String Function() _workspaceId;

  @override
  Future<Result<List<BudgetStatus>, AppError>> status({
    int? month,
    int? year,
  }) async {
    final ws = _workspaceId();
    if (ws.isEmpty) return const Failure(UnauthorizedError());
    final now = DateTime.now();
    final m = month ?? now.month;
    final y = year ?? now.year;
    final result = await _remote.status(month: m, year: y);
    if (ws != _workspaceId()) return const Failure(UnauthorizedError());
    if (result case Success<List<BudgetStatus>, AppError>(value: final rows)) {
      await _db
          .into(_db.cachedBudgetSnapshots)
          .insertOnConflictUpdate(
            CachedBudgetSnapshotsCompanion.insert(
              workspaceId: ws,
              month: m,
              year: y,
              payload: jsonEncode(
                rows
                    .map(
                      (r) => {
                        'id': r.id,
                        'categoryId': r.categoryId,
                        'categoryName': r.categoryName,
                        'amount': r.amount.amount,
                        'spent': r.spent.amount,
                        'currency': r.amount.currency,
                        'percentage': r.percentage,
                      },
                    )
                    .toList(),
              ),
            ),
          );
      return result;
    }
    if (result case Failure<List<BudgetStatus>, AppError>(
      error: NetworkError(),
    )) {
      final snapshot =
          await (_db.select(_db.cachedBudgetSnapshots)..where(
                (t) =>
                    t.workspaceId.equals(ws) &
                    t.month.equals(m) &
                    t.year.equals(y),
              ))
              .getSingleOrNull();
      if (snapshot == null) return const Success([]);
      final rows = (jsonDecode(snapshot.payload) as List)
          .cast<Map<String, dynamic>>();
      return Success(
        rows
            .map(
              (r) => BudgetStatus(
                id: r['id'] as String,
                categoryId: r['categoryId'] as String,
                categoryName: r['categoryName'] as String,
                amount: Money(
                  amount: r['amount'] as num,
                  currency: r['currency'] as String,
                ),
                spent: Money(
                  amount: r['spent'] as num,
                  currency: r['currency'] as String,
                ),
                percentage: r['percentage'] as int,
              ),
            )
            .toList(),
      );
    }
    return result;
  }

  @override
  Future<Result<void, AppError>> create({
    required String categoryId,
    required num amount,
  }) => _remote.create(categoryId: categoryId, amount: amount);
  @override
  Future<Result<void, AppError>> update({
    required String id,
    required num amount,
  }) => _remote.update(id: id, amount: amount);
  @override
  Future<Result<void, AppError>> delete(String id) => _remote.delete(id);
}
