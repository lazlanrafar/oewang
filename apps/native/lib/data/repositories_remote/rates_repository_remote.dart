import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/rates_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';

class RatesRepositoryRemote implements RatesRepository {
  RatesRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<Map<String, double>, AppError>> rates({
    String base = 'USD',
  }) async {
    try {
      final res = await _api.get(
        '/settings/rates',
        queryParameters: {'base': base},
      );
      final data = (res.data as Map<String, dynamic>)['data'];
      if (data is! Map<String, dynamic>) {
        return const Success<Map<String, double>, AppError>(<String, double>{});
      }
      final out = <String, double>{};
      for (final entry in data.entries) {
        final v = entry.value;
        if (v is num) {
          out[entry.key] = v.toDouble();
        } else if (v is String) {
          final parsed = double.tryParse(v);
          if (parsed != null) out[entry.key] = parsed;
        }
      }
      return Success(out);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }
}
