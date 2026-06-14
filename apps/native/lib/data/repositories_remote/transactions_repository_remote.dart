import 'package:dio/dio.dart';
import 'package:intl/intl.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/transaction_dto.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/transaction.dart';

class TransactionsRepositoryRemote implements TransactionsRepository {
  TransactionsRepositoryRemote(this._api);

  final ApiClient _api;
  static final _dateFmt = DateFormat('yyyy-MM-dd');

  @override
  Future<Result<List<Transaction>, AppError>> list(
    TransactionsListQuery query,
  ) async {
    try {
      final res = await _api.get(
        '/transactions',
        queryParameters: <String, dynamic>{
          'startDate': _dateFmt.format(query.from),
          'endDate': _dateFmt.format(query.to),
          'limit': query.limit,
          if (query.type != null) 'type': query.type!.wire,
        },
      );

      final body = res.data;
      if (body is! Map<String, dynamic>) {
        return const Failure(
          ServerError(statusCode: 500, message: 'Unexpected response'),
        );
      }
      final data = body['data'];
      if (data is! List) return const Success<List<Transaction>, AppError>([]);

      final domain = data
          .whereType<Map<String, dynamic>>()
          .map(TransactionDto.fromJson)
          .map((dto) => dto.toDomain())
          .toList();
      return Success(domain);
    } on DioException catch (e) {
      return Failure(_mapDioError(e));
    } on Exception {
      return const Failure(UnknownError());
    }
  }

  AppError _mapDioError(DioException e) {
    final code = e.response?.statusCode;
    final message =
        (e.response?.data is Map<String, dynamic>
            ? (e.response?.data as Map<String, dynamic>)['message'] as String?
            : null) ??
        e.message ??
        'Network error';
    if (code == 401) return UnauthorizedError(message);
    if (e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return NetworkError(message);
    }
    if (code != null && code >= 400) {
      return ServerError(statusCode: code, message: message);
    }
    return UnknownError(message);
  }
}
