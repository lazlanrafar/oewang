import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/data/repositories/budgets_repository.dart';
import 'package:oewang/domain/models/budget_status.dart';
import 'package:oewang/domain/models/money.dart';

class BudgetsRepositoryFake implements BudgetsRepository {
  BudgetsRepositoryFake({List<BudgetStatus>? seed}) : _store = seed ?? _seed;

  static const _seed = <BudgetStatus>[
    BudgetStatus(
      id: 'b-food',
      categoryId: 'cat-food',
      categoryName: 'Food',
      amount: Money(amount: 1500000),
      spent: Money(amount: 124500),
      percentage: 8,
    ),
    BudgetStatus(
      id: 'b-rent',
      categoryId: 'cat-rent',
      categoryName: 'Rent',
      amount: Money(amount: 2000000),
      spent: Money(amount: 1800000),
      percentage: 90,
    ),
  ];

  final List<BudgetStatus> _store;

  @override
  Future<Result<List<BudgetStatus>, AppError>> status({
    int? month,
    int? year,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    return Success(List<BudgetStatus>.unmodifiable(_store));
  }
}
