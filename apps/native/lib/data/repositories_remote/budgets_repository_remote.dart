import 'package:decimal/decimal.dart';
import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/budget_status_dto.dart';
import 'package:oewang/data/repositories/budgets_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/budget_status.dart';

/// `/v1/budgets*`. The status read carries every figure the screens show.
class BudgetsRepositoryRemote implements BudgetsRepository {
  BudgetsRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<BudgetMonth, AppError>> status({int? month, int? year}) async {
    try {
      final data = envelopeData(
        await _api.get(
          '/budgets',
          queryParameters: {
            if (month != null && year != null)
              'month': '$year-${'$month'.padLeft(2, '0')}',
          },
        ),
      );
      return Success(BudgetMonthDto.fromJson(data! as Map<String, dynamic>));
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  @override
  Future<Result<void, AppError>> create({
    required String categoryId,
    required Decimal amount,
  }) => _void(
    () => _api.post(
      '/budgets',
      data: {'category_id': categoryId, 'amount': amount.toString()},
    ),
  );

  @override
  Future<Result<void, AppError>> update({
    required String id,
    required Decimal amount,
  }) => _void(
    () => _api.patch('/budgets/$id', data: {'amount': amount.toString()}),
  );

  @override
  Future<Result<void, AppError>> delete(String id) =>
      _void(() => _api.delete('/budgets/$id'));

  Future<Result<void, AppError>> _void(
    Future<Response<dynamic>> Function() send,
  ) async {
    try {
      await send();
      return const Success<void, AppError>(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }
}
