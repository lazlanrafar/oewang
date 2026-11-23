import 'package:decimal/decimal.dart';
import 'package:dio/dio.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/dto/transaction_dto.dart';
import 'package:oewang/data/repositories/overview_repository.dart';
import 'package:oewang/data/repositories_remote/dio_error_mapper.dart';
import 'package:oewang/data/services/api/api_client.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/overview.dart';

class OverviewRepositoryRemote implements OverviewRepository {
  OverviewRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Result<Overview, AppError>> overview({
    required DateTime from,
    required DateTime to,
  }) async {
    try {
      final data = envelopeData(
        await _api.get(
          '/overview',
          queryParameters: {
            'from': TransactionDto.dayFormat.format(from),
            'to': TransactionDto.dayFormat.format(to),
          },
        ),
      );
      return Success(overviewFromJson(data! as Map<String, dynamic>));
    } on DioException catch (e) {
      return Failure(mapDioError(e));
    }
  }
}

/// The `Overview` wire shape; decimal strings stay exact (D12).
Overview overviewFromJson(Map<String, dynamic> json) {
  final currency = json['currency_code'] as String;
  Money money(Object? v) =>
      Money(amount: Decimal.parse(v! as String), currency: currency);
  List<CategoryShare> shares(String key) => [
    for (final row in json[key] as List)
      CategoryShare(
        id: (row as Map<String, dynamic>)['id'] as String?,
        name: row['name'] as String?,
        other: row['other'] as bool? ?? false,
        total: money(row['total']),
        sharePercent: switch (row['share_percent']) {
          final String p => Decimal.parse(p),
          _ => null,
        },
      ),
  ];

  return Overview(
    income: money((json['income'] as Map<String, dynamic>)['value']),
    expense: money((json['expense'] as Map<String, dynamic>)['value']),
    incomeCategories: shares('income_categories'),
    expenseCategories: shares('expense_categories'),
  );
}
