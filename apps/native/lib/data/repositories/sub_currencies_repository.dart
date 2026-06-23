import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/sub_currency.dart';

abstract class SubCurrenciesRepository {
  Future<Result<List<SubCurrency>, AppError>> list();
  Future<Result<SubCurrency, AppError>> create(String currencyCode);
  Future<Result<void, AppError>> delete(String id);
}
