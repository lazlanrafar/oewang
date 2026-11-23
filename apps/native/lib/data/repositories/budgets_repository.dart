import 'package:decimal/decimal.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/budget_status.dart';

abstract class BudgetsRepository {
  /// `GET /v1/budgets` for the given month (1-12) and year; the API defaults
  /// to the current month when either is omitted.
  Future<Result<BudgetMonth, AppError>> status({int? month, int? year});

  Future<Result<void, AppError>> create({
    required String categoryId,
    required Decimal amount,
  });
  Future<Result<void, AppError>> update({
    required String id,
    required Decimal amount,
  });
  Future<Result<void, AppError>> delete(String id);
}
