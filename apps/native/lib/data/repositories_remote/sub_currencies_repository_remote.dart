import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/sub_currency_dto.dart';
import 'package:oewang/data/repositories/sub_currencies_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/sub_currency.dart';

class SubCurrenciesRepositoryRemote implements SubCurrenciesRepository {
  SubCurrenciesRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<List<SubCurrency>, AppError>> list() async {
    try {
      final res = await _api.get('/settings/sub-currencies');
      final data = (res.data as Map<String, dynamic>)['data'];
      if (data is! List) return const Success<List<SubCurrency>, AppError>([]);
      return Success(
        data
            .whereType<Map<String, dynamic>>()
            .map(SubCurrencyDto.fromJson)
            .map((d) => d.toDomain())
            .toList(),
      );
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<SubCurrency, AppError>> create(String currencyCode) async {
    try {
      final res = await _api.post(
        '/settings/sub-currencies',
        data: {'currencyCode': currencyCode},
      );
      final json = (res.data as Map<String, dynamic>)['data'];
      if (json is! Map<String, dynamic>) {
        return const Failure(
          ServerError(statusCode: 500, message: 'Unexpected response'),
        );
      }
      return Success(SubCurrencyDto.fromJson(json).toDomain());
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  @override
  Future<Result<void, AppError>> delete(String id) async {
    try {
      await _api.delete('/settings/sub-currencies/$id');
      return const Success<void, AppError>(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }
}
