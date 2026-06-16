import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/budget_status.dart';

abstract class BudgetsRepository {
  /// Returns per-category status for the given month (1-12) and year. The
  /// API defaults both to the current month when omitted.
  Future<Result<List<BudgetStatus>, AppError>> status({int? month, int? year});
}
