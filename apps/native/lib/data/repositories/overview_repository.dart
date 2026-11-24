import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/overview.dart';

abstract class OverviewRepository {
  /// `GET /v1/overview` for the inclusive local days [from] to [to].
  Future<Result<Overview, AppError>> overview({
    required DateTime from,
    required DateTime to,
  });
}
