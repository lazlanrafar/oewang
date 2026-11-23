import 'package:decimal/decimal.dart';
import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/budget_status_dto.dart';
import 'package:oewang/data/repositories/budgets_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/budget_status.dart';

// shortcut: still the old app's routes and bodies, so these calls fail
// against the new API and the screen shows its error or empty state. Ported
// with the budget screens and the summary tab's budget card in M2 (OEW-086).
class BudgetsRepositoryRemote implements BudgetsRepository {
  BudgetsRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<List<BudgetStatus>, AppError>> status({
    int? month,
    int? year,
  }) async {
    try {
      final res = await _api.get(
        '/budgets/status',
        queryParameters: {
          if (month != null) 'month': month,
          if (year != null) 'year': year,
        },
      );
      final body = res.data;
      if (body is! Map<String, dynamic>) {
        return const Success<List<BudgetStatus>, AppError>([]);
      }
      final data = body['data'];
      if (data is! List) {
        return const Success<List<BudgetStatus>, AppError>([]);
      }
      final statuses = data
          .whereType<Map<String, dynamic>>()
          .map(BudgetStatusDto.fromJson)
          .map((d) => d.toDomain())
          .toList();
      return Success(statuses);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<void, AppError>> create({
    required String categoryId,
    required Decimal amount,
  }) async {
    try {
      await _api.post(
        '/budgets',
        data: {'categoryId': categoryId, 'amount': amount.toString()},
      );
      return const Success(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<void, AppError>> update({
    required String id,
    required Decimal amount,
  }) async {
    try {
      await _api.put('/budgets/$id', data: {'amount': amount.toString()});
      return const Success(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<void, AppError>> delete(String id) async {
    try {
      await _api.delete('/budgets/$id');
      return const Success(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }
}
