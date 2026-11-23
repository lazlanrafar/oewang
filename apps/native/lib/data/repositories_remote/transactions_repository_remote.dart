import 'package:decimal/decimal.dart';
import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/transaction_dto.dart';
import 'package:oewang/data/repositories/transactions_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/new_transaction_draft.dart';
import 'package:oewang/domain/models/transaction.dart';

class TransactionsRepositoryRemote implements TransactionsRepository {
  TransactionsRepositoryRemote(this._api);

  final ApiClient _api;

  @override
  Future<Result<List<Transaction>, AppError>> list(
    TransactionsListQuery query,
  ) async {
    try {
      final data = envelopeData(
        await _api.get(
          '/transactions',
          queryParameters: {
            'start_date': TransactionDto.dayFormat.format(query.from),
            'end_date': TransactionDto.dayFormat.format(query.to),
            'limit': query.limit,
            'page': query.page,
            'type': query.type?.wire,
          },
        ),
      );
      return Success([
        for (final row in (data as List?) ?? const [])
          TransactionDto.fromJson(row as Map<String, dynamic>).toDomain(),
      ]);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  @override
  Future<Result<TransactionsSummary, AppError>> summary({
    required DateTime from,
    required DateTime to,
  }) async {
    try {
      final data =
          envelopeData(
                await _api.get(
                  '/transactions/summary',
                  queryParameters: {
                    'start_date': TransactionDto.dayFormat.format(from),
                    'end_date': TransactionDto.dayFormat.format(to),
                  },
                ),
              )!
              as Map<String, dynamic>;
      final currency = data['currency_code'] as String;
      Money total(String type) {
        for (final row in data['by_type'] as List) {
          final m = row as Map<String, dynamic>;
          if (m['type'] == type) {
            return Money.parse(m['total'] as String, currency: currency);
          }
        }
        return Money(amount: Decimal.zero, currency: currency);
      }

      return Success(
        TransactionsSummary(
          currency: currency,
          income: total('income'),
          expense: total('expense'),
        ),
      );
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  @override
  Future<Result<Transaction, AppError>> create(NewTransactionDraft draft) =>
      _write(
        () => _api.post('/transactions', data: TransactionDto.body(draft)),
      );

  @override
  Future<Result<Transaction, AppError>> update(
    String id,
    NewTransactionDraft draft,
  ) => _write(
    () => _api.patch('/transactions/$id', data: TransactionDto.body(draft)),
  );

  Future<Result<Transaction, AppError>> _write(
    Future<Response<dynamic>> Function() send,
  ) async {
    try {
      final data = envelopeData(await send());
      return Success(
        TransactionDto.fromJson(data! as Map<String, dynamic>).toDomain(),
      );
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }

  @override
  Future<Result<void, AppError>> delete(String id) async {
    try {
      await _api.delete('/transactions/$id');
      return const Success<void, AppError>(null);
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }
}
