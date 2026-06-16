import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';

abstract class RatesRepository {
  /// Returns a map of currency code → rate against [base]. Each value is
  /// `1 unit of base = N units of code`.
  Future<Result<Map<String, double>, AppError>> rates({String base = 'USD'});
}
