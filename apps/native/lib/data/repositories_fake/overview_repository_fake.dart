import 'package:decimal/decimal.dart';
import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/overview_repository.dart';
import 'package:oewang/domain/models/money.dart';
import 'package:oewang/domain/models/overview.dart';

class OverviewRepositoryFake implements OverviewRepository {
  OverviewRepositoryFake({Overview? seed}) : _overview = seed ?? _seed;

  static final _seed = Overview(
    income: Money(amount: Decimal.fromInt(5000000)),
    expense: Money(amount: Decimal.fromInt(200000)),
    incomeCategories: [
      CategoryShare(
        id: 'cat-salary',
        name: 'Salary',
        total: Money(amount: Decimal.fromInt(5000000)),
        sharePercent: Decimal.fromInt(100),
      ),
    ],
    expenseCategories: [
      CategoryShare(
        id: 'cat-food',
        name: 'Food',
        total: Money(amount: Decimal.fromInt(150000)),
        sharePercent: Decimal.fromInt(75),
      ),
      CategoryShare(
        total: Money(amount: Decimal.fromInt(50000)),
        sharePercent: Decimal.fromInt(25),
      ),
    ],
  );

  final Overview _overview;

  @override
  Future<Result<Overview, AppError>> overview({
    required DateTime from,
    required DateTime to,
  }) async => Success(_overview);
}
